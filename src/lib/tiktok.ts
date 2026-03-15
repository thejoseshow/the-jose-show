import { supabase } from "./supabase";
import type { PlatformToken } from "./types";

const TIKTOK_API = "https://open.tiktokapis.com/v2";

function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://thejoseshow.vercel.app";
}

async function getTikTokToken(): Promise<string> {
  const { data } = await supabase
    .from("platform_tokens")
    .select("*")
    .eq("platform", "tiktok")
    .single();

  if (!data) throw new Error("No TikTok token found. Please authenticate first.");
  return (data as PlatformToken).access_token;
}

interface TikTokUploadParams {
  videoUrl: string;
  caption: string;
}

/**
 * Post a video to TikTok using the Content Posting API.
 * Flow: init upload → upload video → publish
 */
export async function postToTikTok(params: TikTokUploadParams): Promise<string> {
  const { videoUrl, caption } = params;
  const token = await getTikTokToken();

  // Download video to get size
  const videoRes = await fetch(videoUrl);
  const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

  // Step 1: Initialize upload via pull (TikTok fetches the URL)
  const initRes = await fetch(`${TIKTOK_API}/post/publish/video/init/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      post_info: {
        title: caption.slice(0, 150),
        privacy_level: "PUBLIC_TO_EVERYONE",
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: {
        source: "PULL_FROM_URL",
        video_url: videoUrl,
      },
    }),
  });

  const initData = await initRes.json();
  if (initData.error?.code) {
    throw new Error(`TikTok init error: ${initData.error.message || initData.error.code}`);
  }

  const publishId = initData.data?.publish_id;
  if (!publishId) throw new Error("TikTok did not return a publish_id");

  // Step 2: Poll publish status
  let status = "PROCESSING_UPLOAD";
  let attempts = 0;
  let postId: string | null = null;

  while (status === "PROCESSING_UPLOAD" && attempts < 60) {
    await new Promise((r) => setTimeout(r, 5000));

    const statusRes = await fetch(`${TIKTOK_API}/post/publish/status/fetch/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ publish_id: publishId }),
    });

    const statusData = await statusRes.json();
    status = statusData.data?.status || "FAILED";
    postId = statusData.data?.publicaly_available_post_id?.[0] || null;
    attempts++;
  }

  if (status === "PUBLISH_COMPLETE" && postId) {
    return postId;
  }

  if (status === "FAILED") {
    throw new Error("TikTok publishing failed - video may have been rejected");
  }

  // Return publish_id as fallback reference
  return publishId;
}

/**
 * Exchange TikTok authorization code for tokens.
 */
export async function exchangeTikTokCode(code: string) {
  const res = await fetch(`${TIKTOK_API}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY || "",
      client_secret: process.env.TIKTOK_CLIENT_SECRET || "",
      code,
      grant_type: "authorization_code",
      redirect_uri: `${getSiteUrl()}/api/auth/tiktok`,
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(`TikTok auth error: ${data.error_description || data.error}`);

  await supabase.from("platform_tokens").upsert(
    {
      platform: "tiktok",
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
      scopes: data.scope?.split(",") || [],
      updated_at: new Date().toISOString(),
    },
    { onConflict: "platform" }
  );
}

/**
 * Refresh TikTok token.
 */
export async function refreshTikTokToken(): Promise<void> {
  const { data: tokenRow } = await supabase
    .from("platform_tokens")
    .select("*")
    .eq("platform", "tiktok")
    .single();

  if (!tokenRow?.refresh_token) throw new Error("No TikTok refresh token");

  const res = await fetch(`${TIKTOK_API}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY || "",
      client_secret: process.env.TIKTOK_CLIENT_SECRET || "",
      grant_type: "refresh_token",
      refresh_token: tokenRow.refresh_token,
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(`TikTok refresh error: ${data.error_description}`);

  await supabase
    .from("platform_tokens")
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("platform", "tiktok");
}

/**
 * Get video insights from TikTok Video Query API v2.
 */
export async function getTikTokVideoInsights(
  publishId: string
): Promise<{ views: number; likes: number; comments: number; shares: number } | null> {
  const token = await getTikTokToken();

  const res = await fetch(`${TIKTOK_API}/video/query/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filters: {
        video_ids: [publishId],
      },
      fields: ["id", "like_count", "comment_count", "share_count", "view_count"],
    }),
  });

  const data = await res.json();
  const video = data.data?.videos?.[0];
  if (!video) return null;

  return {
    views: video.view_count || 0,
    likes: video.like_count || 0,
    comments: video.comment_count || 0,
    shares: video.share_count || 0,
  };
}

/**
 * Get TikTok OAuth URL to start authentication.
 */
export function getTikTokAuthUrl(): string {
  const params = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY || "",
    redirect_uri: `${getSiteUrl()}/api/auth/tiktok`,
    scope: "user.info.basic,video.publish,video.upload,video.list",
    response_type: "code",
    state: "tjs_tiktok_auth",
  });
  return `https://www.tiktok.com/v2/auth/authorize/?${params}`;
}
