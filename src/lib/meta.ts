import { supabase } from "./supabase";
import type { PlatformToken } from "./types";

const GRAPH_API = "https://graph.facebook.com/v21.0";

// ----- OAuth Helpers -----

const META_OAUTH_SCOPES =
  "pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish";

function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://thejoseshow.vercel.app";
}

export function getMetaAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID || "",
    redirect_uri: `${getSiteUrl()}/api/auth/meta`,
    scope: META_OAUTH_SCOPES,
    response_type: "code",
    state: "tjs_meta_auth",
  });
  return `https://www.facebook.com/v21.0/dialog/oauth?${params}`;
}

export async function exchangeMetaCode(code: string): Promise<void> {
  // Step 1: Exchange code for short-lived user token
  const tokenRes = await fetch(
    `${GRAPH_API}/oauth/access_token?` +
      new URLSearchParams({
        client_id: process.env.META_APP_ID || "",
        client_secret: process.env.META_APP_SECRET || "",
        redirect_uri: `${getSiteUrl()}/api/auth/meta`,
        code,
      })
  );
  const tokenData = await tokenRes.json();
  if (tokenData.error) {
    throw new Error(`Meta code exchange error: ${tokenData.error.message}`);
  }

  // Step 2: Exchange short-lived token for long-lived user token (60 days)
  const longLivedRes = await fetch(
    `${GRAPH_API}/oauth/access_token?` +
      new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: process.env.META_APP_ID || "",
        client_secret: process.env.META_APP_SECRET || "",
        fb_exchange_token: tokenData.access_token,
      })
  );
  const longLivedData = await longLivedRes.json();
  if (longLivedData.error) {
    throw new Error(`Meta long-lived token error: ${longLivedData.error.message}`);
  }

  // Step 3: Get Page Access Token (required for posting to Page + Instagram)
  // A long-lived user token yields a non-expiring Page token
  const pageId = process.env.META_PAGE_ID;
  let pageToken = longLivedData.access_token; // fallback to user token

  if (pageId) {
    const pagesRes = await fetch(
      `${GRAPH_API}/me/accounts?access_token=${longLivedData.access_token}`
    );
    const pagesData = await pagesRes.json();
    const page = pagesData.data?.find((p: { id: string }) => p.id === pageId);
    if (page?.access_token) {
      pageToken = page.access_token;
    } else {
      console.warn("Page token not found in me/accounts — using user token. Page posting may fail.");
    }
  }

  // Step 4: Upsert to Supabase (store Page token for posting)
  const { error } = await supabase.from("platform_tokens").upsert(
    {
      platform: "facebook",
      access_token: pageToken,
      refresh_token: longLivedData.access_token, // store user token as backup
      expires_at: null, // Page tokens from long-lived user tokens don't expire
      scopes: META_OAUTH_SCOPES.split(","),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "platform" }
  );
  if (error) throw new Error(`Failed to save Meta token: ${error.message}`);
}

async function getMetaToken(): Promise<string> {
  const { data } = await supabase
    .from("platform_tokens")
    .select("*")
    .eq("platform", "facebook")
    .single();

  if (!data) throw new Error("No Meta token found. Please authenticate first.");
  return (data as PlatformToken).access_token;
}

// ----- Facebook Page Video Post -----

interface FacebookPostParams {
  videoUrl: string; // Publicly accessible URL
  description: string;
}

/**
 * Post a video to a Facebook Page.
 * Uses the resumable upload API for reliability.
 */
export async function postToFacebook(params: FacebookPostParams): Promise<string> {
  const { videoUrl, description } = params;
  const token = await getMetaToken();
  const pageId = process.env.META_PAGE_ID;
  if (!pageId) throw new Error("Missing META_PAGE_ID");

  // Download video to get buffer
  const videoRes = await fetch(videoUrl);
  const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

  // Step 1: Initialize upload session
  const initRes = await fetch(
    `${GRAPH_API}/${pageId}/videos`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: token,
        upload_phase: "start",
        file_size: videoBuffer.length,
      }),
    }
  );
  const initData = await initRes.json();
  if (initData.error) throw new Error(`FB init error: ${initData.error.message}`);

  const { upload_session_id, video_id } = initData;

  // Step 2: Upload video data
  const formData = new FormData();
  formData.append("access_token", token);
  formData.append("upload_phase", "transfer");
  formData.append("upload_session_id", upload_session_id);
  formData.append("start_offset", "0");
  formData.append(
    "video_file_chunk",
    new Blob([videoBuffer]),
    "video.mp4"
  );

  const transferRes = await fetch(`${GRAPH_API}/${pageId}/videos`, {
    method: "POST",
    body: formData,
  });
  const transferData = await transferRes.json();
  if (transferData.error) throw new Error(`FB transfer error: ${transferData.error.message}`);

  // Step 3: Finish upload
  const finishRes = await fetch(`${GRAPH_API}/${pageId}/videos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      access_token: token,
      upload_phase: "finish",
      upload_session_id,
      description,
    }),
  });
  const finishData = await finishRes.json();
  if (finishData.error) throw new Error(`FB finish error: ${finishData.error.message}`);

  return video_id || finishData.id;
}

// ----- Instagram Reels -----

interface InstagramReelParams {
  videoUrl: string; // Publicly accessible URL
  caption: string;
}

/**
 * Post a Reel to Instagram via the Content Publishing API.
 * Requires a publicly accessible video URL.
 */
export async function postToInstagram(params: InstagramReelParams): Promise<string> {
  const { videoUrl, caption } = params;
  const token = await getMetaToken();
  const igAccountId = process.env.META_INSTAGRAM_ACCOUNT_ID;
  if (!igAccountId) throw new Error("Missing META_INSTAGRAM_ACCOUNT_ID");

  // Step 1: Create media container
  const containerRes = await fetch(
    `${GRAPH_API}/${igAccountId}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: token,
        media_type: "REELS",
        video_url: videoUrl,
        caption,
        share_to_feed: true,
      }),
    }
  );
  const containerData = await containerRes.json();
  if (containerData.error) throw new Error(`IG container error: ${containerData.error.message}`);

  const containerId = containerData.id;

  // Step 2: Wait for video processing (poll status)
  let status = "IN_PROGRESS";
  let attempts = 0;
  while (status === "IN_PROGRESS" && attempts < 30) {
    await new Promise((r) => setTimeout(r, 5000)); // 5s between polls
    const statusRes = await fetch(
      `${GRAPH_API}/${containerId}?fields=status_code&access_token=${token}`
    );
    const statusData = await statusRes.json();
    status = statusData.status_code;
    attempts++;
  }

  if (status !== "FINISHED") {
    throw new Error(`IG video processing failed: status=${status}`);
  }

  // Step 3: Publish the container
  const publishRes = await fetch(
    `${GRAPH_API}/${igAccountId}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: token,
        creation_id: containerId,
      }),
    }
  );
  const publishData = await publishRes.json();
  if (publishData.error) throw new Error(`IG publish error: ${publishData.error.message}`);

  return publishData.id;
}

// ----- Token Refresh -----

/**
 * Exchange a short-lived Meta token for a long-lived one (60 days).
 * Call this during initial setup or when refreshing.
 */
export async function refreshMetaToken(): Promise<void> {
  const { data: tokenRow } = await supabase
    .from("platform_tokens")
    .select("*")
    .eq("platform", "facebook")
    .single();

  if (!tokenRow) throw new Error("No Meta token found");

  // Use the stored user token (refresh_token field) to get a fresh long-lived user token
  const userToken = (tokenRow as PlatformToken).refresh_token || (tokenRow as PlatformToken).access_token;

  const res = await fetch(
    `${GRAPH_API}/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.META_APP_ID}&client_secret=${process.env.META_APP_SECRET}&fb_exchange_token=${userToken}`
  );
  const data = await res.json();

  if (data.error) throw new Error(`Meta token refresh error: ${data.error.message}`);

  // Re-fetch Page token from refreshed user token
  const pageId = process.env.META_PAGE_ID;
  let pageToken = data.access_token;

  if (pageId) {
    const pagesRes = await fetch(
      `${GRAPH_API}/me/accounts?access_token=${data.access_token}`
    );
    const pagesData = await pagesRes.json();
    const page = pagesData.data?.find((p: { id: string }) => p.id === pageId);
    if (page?.access_token) {
      pageToken = page.access_token;
    }
  }

  await supabase
    .from("platform_tokens")
    .update({
      access_token: pageToken,
      refresh_token: data.access_token,
      expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("platform", "facebook");
}

// ----- Analytics -----

export async function getFacebookVideoInsights(videoId: string) {
  const token = await getMetaToken();
  const res = await fetch(
    `${GRAPH_API}/${videoId}?fields=views,likes.summary(true),comments.summary(true),shares&access_token=${token}`
  );
  const data = await res.json();

  if (data.error) {
    console.error(`FB insights error for ${videoId}:`, data.error.message);
    return { views: 0, likes: 0, comments: 0, shares: 0 };
  }

  return {
    views: typeof data.views === "number" ? data.views : 0,
    likes: typeof data.likes?.summary?.total_count === "number" ? data.likes.summary.total_count : 0,
    comments: typeof data.comments?.summary?.total_count === "number" ? data.comments.summary.total_count : 0,
    shares: typeof data.shares?.count === "number" ? data.shares.count : 0,
  };
}

export async function getInstagramMediaInsights(mediaId: string) {
  const token = await getMetaToken();
  const res = await fetch(
    `${GRAPH_API}/${mediaId}/insights?metric=plays,likes,comments,shares&access_token=${token}`
  );
  const data = await res.json();

  if (data.error) {
    console.error(`IG insights error for ${mediaId}:`, data.error.message);
    return { views: 0, likes: 0, comments: 0, shares: 0 };
  }

  const metrics: Record<string, number> = {};
  for (const item of data.data || []) {
    if (item && typeof item.name === "string") {
      const val = item.values?.[0]?.value;
      metrics[item.name] = typeof val === "number" ? val : 0;
    }
  }

  return {
    views: metrics.plays || 0,
    likes: metrics.likes || 0,
    comments: metrics.comments || 0,
    shares: metrics.shares || 0,
  };
}
