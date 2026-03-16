import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

interface AttentionItem {
  type: "failed_video" | "partial_publish" | "failed_content" | "expiring_token";
  id: string;
  title: string;
  detail: string;
  link: string;
}

// GET /api/dashboard/attention - Items that need user attention
export async function GET() {
  const items: AttentionItem[] = [];

  // 1. Failed videos
  const { data: failedVideos } = await supabase
    .from("videos")
    .select("id, filename, error_message, updated_at")
    .eq("status", "failed")
    .order("updated_at", { ascending: false })
    .limit(5);

  for (const v of failedVideos || []) {
    items.push({
      type: "failed_video",
      id: v.id,
      title: v.filename,
      detail: v.error_message || "Pipeline processing failed",
      link: "/dashboard/uploads",
    });
  }

  // 2. Partially published content
  const { data: partialContent } = await supabase
    .from("content")
    .select("id, title, updated_at")
    .eq("status", "partially_published")
    .order("updated_at", { ascending: false })
    .limit(5);

  for (const c of partialContent || []) {
    items.push({
      type: "partial_publish",
      id: c.id,
      title: c.title,
      detail: "Some platforms failed — retry available",
      link: `/dashboard/content/${c.id}`,
    });
  }

  // 3. Failed content (publish failed entirely)
  const { data: failedContent } = await supabase
    .from("content")
    .select("id, title, updated_at")
    .eq("status", "failed")
    .order("updated_at", { ascending: false })
    .limit(5);

  for (const c of failedContent || []) {
    items.push({
      type: "failed_content",
      id: c.id,
      title: c.title,
      detail: "Publishing failed on all platforms",
      link: `/dashboard/content/${c.id}`,
    });
  }

  // 4. Expiring tokens (within 7 days)
  // Skip Google — its access token expires hourly but auto-refreshes via refresh_token
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: expiringTokens } = await supabase
    .from("platform_tokens")
    .select("id, platform, expires_at, refresh_token")
    .not("expires_at", "is", null)
    .lt("expires_at", sevenDaysFromNow);

  for (const t of expiringTokens || []) {
    // Google auto-refreshes via refresh_token — only warn if refresh_token is missing
    if (t.platform === "google" && t.refresh_token) continue;

    const expiresAt = new Date(t.expires_at);
    const daysLeft = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    const authLink = t.platform === "google" ? "/api/auth/google"
      : t.platform === "facebook" ? "/api/auth/meta"
      : "/api/auth/tiktok";
    if (daysLeft <= 0) {
      items.push({
        type: "expiring_token",
        id: t.id,
        title: `${t.platform} token expired`,
        detail: "Reconnect to continue publishing",
        link: authLink,
      });
    } else {
      items.push({
        type: "expiring_token",
        id: t.id,
        title: `${t.platform} token expires in ${daysLeft} day(s)`,
        detail: "Reconnect soon to avoid interruption",
        link: authLink,
      });
    }
  }

  return NextResponse.json({ success: true, data: items });
}
