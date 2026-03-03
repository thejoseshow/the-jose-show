import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { refreshMetaToken } from "@/lib/meta";
import { refreshTikTokToken } from "@/lib/tiktok";
import { notifyPipelineError } from "@/lib/notifications";

// GET /api/cron/refresh-tokens - Refresh OAuth tokens before they expire
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, { refreshed: boolean; error?: string }> = {};

  // Check Meta token
  try {
    const { data: metaToken } = await supabase
      .from("platform_tokens")
      .select("expires_at")
      .eq("platform", "facebook")
      .single();

    if (metaToken?.expires_at) {
      const expiresAt = new Date(metaToken.expires_at);
      const daysUntilExpiry = (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);

      // Refresh if expiring within 7 days
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

  // Check TikTok token
  try {
    const { data: tiktokToken } = await supabase
      .from("platform_tokens")
      .select("expires_at")
      .eq("platform", "tiktok")
      .single();

    if (tiktokToken?.expires_at) {
      const expiresAt = new Date(tiktokToken.expires_at);
      const daysUntilExpiry = (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);

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

  // Google tokens auto-refresh via the googleapis library (handled in google-drive.ts)
  results.google = { refreshed: false };

  return NextResponse.json({ success: true, data: results });
}
