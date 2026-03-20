import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { refreshMetaToken } from "@/lib/meta";
import { refreshTikTokToken } from "@/lib/tiktok";
import { getAuthenticatedClient } from "@/lib/google-drive";
import { notifyPipelineError } from "@/lib/notifications";
import { withCronLog } from "@/lib/cron-logger";

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await withCronLog("refresh-tokens", async () => {
    const results: Record<string, { refreshed: boolean; error?: string }> = {};

    try {
      const { data: metaToken } = await supabase
        .from("platform_tokens")
        .select("expires_at")
        .eq("platform", "facebook")
        .single();

      if (metaToken?.expires_at) {
        const daysUntilExpiry = (new Date(metaToken.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
        if (daysUntilExpiry < 7) {
          await refreshMetaToken();
          results.facebook = { refreshed: true };
        } else {
          results.facebook = { refreshed: false };
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      results.facebook = { refreshed: false, error: errorMsg };
      await notifyPipelineError("Meta Token Refresh", errorMsg).catch(console.error);
    }

    try {
      const { data: tiktokToken } = await supabase
        .from("platform_tokens")
        .select("expires_at")
        .eq("platform", "tiktok")
        .single();

      if (tiktokToken?.expires_at) {
        const daysUntilExpiry = (new Date(tiktokToken.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
        if (daysUntilExpiry < 7) {
          await refreshTikTokToken();
          results.tiktok = { refreshed: true };
        } else {
          results.tiktok = { refreshed: false };
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      results.tiktok = { refreshed: false, error: errorMsg };
      await notifyPipelineError("TikTok Token Refresh", errorMsg).catch(console.error);
    }

    // Renew Google Drive push webhook (expires every ~24hrs)
    try {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
      const adminSecret = process.env.ADMIN_SECRET;
      if (siteUrl && adminSecret) {
        const watchRes = await fetch(`${siteUrl}/api/admin/setup-drive-watch`, {
          method: "POST",
          headers: { Authorization: `Bearer ${adminSecret}`, "Content-Type": "application/json" },
        });
        const watchData = await watchRes.json();
        results.drive_watch = { refreshed: watchData.success, error: watchData.success ? undefined : watchData.error };
      } else {
        results.drive_watch = { refreshed: false, error: "Missing NEXT_PUBLIC_SITE_URL or ADMIN_SECRET" };
      }
    } catch (err) {
      results.drive_watch = { refreshed: false, error: err instanceof Error ? err.message : "Unknown error" };
    }

    // Proactively refresh Google token (triggers on("tokens") handler to persist)
    try {
      const auth = await getAuthenticatedClient();
      const { token } = await auth.getAccessToken();
      results.google = { refreshed: !!token };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      results.google = { refreshed: false, error: errorMsg };
      await notifyPipelineError("Google Token Refresh", errorMsg).catch(console.error);
    }

    return results;
  });

  return NextResponse.json({ success: true, data: result });
}
