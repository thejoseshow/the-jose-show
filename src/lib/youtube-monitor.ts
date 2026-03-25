// ============================================================
// The Jose Show - YouTube Channel Monitor
// ============================================================
//
// Monitors YouTube channels for new uploads and sends them to
// Opus Clip for clipping via Zapier webhook.
// Uses YouTube Data API v3 playlistItems.list (1 quota unit per call).
//
// Env vars: YOUTUBE_API_KEY, ZAPIER_WEBHOOK_CLIP_VIDEO

import { supabase } from "./supabase";
import { sendToOpusClip } from "./opus-clip";

// --- Types ---

export interface MonitoredChannel {
  id: string;
  channel_id: string;
  channel_name: string;
  uploads_playlist_id: string;
  last_checked_video_id: string | null;
  last_checked_at: string | null;
  enabled: boolean;
  auto_clip: boolean;
  created_at: string;
  updated_at: string;
}

export interface YouTubePlaylistItem {
  videoId: string;
  title: string;
  publishedAt: string;
  thumbnailUrl: string | null;
}

interface YouTubeChannelResult {
  channelId: string;
  channelName: string;
  uploadsPlaylistId: string;
}

// --- YouTube API Helpers ---

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

function getYouTubeApiKey(): string {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("Missing YOUTUBE_API_KEY environment variable");
  return key;
}

/**
 * Resolve a YouTube channel URL, handle, or ID into channel details.
 * Accepts:
 *   - https://youtube.com/@handle
 *   - https://youtube.com/channel/UCxxxxxx
 *   - @handle
 *   - UCxxxxxx (raw channel ID)
 */
export async function resolveChannel(
  input: string
): Promise<YouTubeChannelResult> {
  const apiKey = getYouTubeApiKey();
  const trimmed = input.trim();

  // Try to extract from URL patterns
  let channelId: string | null = null;
  let handle: string | null = null;

  // youtube.com/channel/UCxxxxxx
  const channelUrlMatch = trimmed.match(
    /youtube\.com\/channel\/(UC[\w-]+)/i
  );
  if (channelUrlMatch) {
    channelId = channelUrlMatch[1];
  }

  // youtube.com/@handle
  const handleUrlMatch = trimmed.match(/youtube\.com\/@([\w.-]+)/i);
  if (handleUrlMatch) {
    handle = handleUrlMatch[1];
  }

  // Bare @handle
  if (!channelId && !handle && trimmed.startsWith("@")) {
    handle = trimmed.slice(1);
  }

  // Bare channel ID (starts with UC)
  if (!channelId && !handle && trimmed.startsWith("UC")) {
    channelId = trimmed;
  }

  // If we have a handle, resolve it to a channel ID via search/channels
  if (handle && !channelId) {
    const url = `${YOUTUBE_API_BASE}/channels?part=snippet,contentDetails&forHandle=${encodeURIComponent(handle)}&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`YouTube API error resolving handle @${handle}: ${res.status} ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    if (!data.items || data.items.length === 0) {
      // Fallback: try search API
      const searchUrl = `${YOUTUBE_API_BASE}/search?part=snippet&type=channel&q=${encodeURIComponent("@" + handle)}&maxResults=1&key=${apiKey}`;
      const searchRes = await fetch(searchUrl);
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.items && searchData.items.length > 0) {
          channelId = searchData.items[0].snippet.channelId;
        }
      }
      if (!channelId) {
        throw new Error(`Could not find YouTube channel for handle @${handle}`);
      }
    } else {
      const item = data.items[0];
      return {
        channelId: item.id,
        channelName: item.snippet.title,
        uploadsPlaylistId:
          item.contentDetails.relatedPlaylists.uploads ||
          item.id.replace(/^UC/, "UU"),
      };
    }
  }

  if (!channelId) {
    throw new Error(
      `Could not parse YouTube channel from input: "${trimmed}". ` +
        "Use a channel URL (youtube.com/@handle or youtube.com/channel/UCxxx), " +
        "a handle (@name), or a channel ID (UCxxxxxx)."
    );
  }

  // Fetch channel details by ID
  const url = `${YOUTUBE_API_BASE}/channels?part=snippet,contentDetails&id=${encodeURIComponent(channelId)}&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `YouTube API error fetching channel ${channelId}: ${res.status} ${text.slice(0, 200)}`
    );
  }
  const data = await res.json();
  if (!data.items || data.items.length === 0) {
    throw new Error(`YouTube channel not found: ${channelId}`);
  }

  const item = data.items[0];
  return {
    channelId: item.id,
    channelName: item.snippet.title,
    uploadsPlaylistId:
      item.contentDetails?.relatedPlaylists?.uploads ||
      channelId.replace(/^UC/, "UU"),
  };
}

/**
 * Get new videos from a channel's uploads playlist.
 * Returns videos published after the last checked video.
 * If lastCheckedVideoId is null, returns the most recent video only
 * (to set a baseline without flooding Opus Clip).
 */
export async function getNewVideos(
  channel: MonitoredChannel
): Promise<YouTubePlaylistItem[]> {
  const apiKey = getYouTubeApiKey();
  const url =
    `${YOUTUBE_API_BASE}/playlistItems?part=snippet&playlistId=${encodeURIComponent(channel.uploads_playlist_id)}` +
    `&maxResults=10&key=${apiKey}`;

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `YouTube API error fetching playlist ${channel.uploads_playlist_id}: ${res.status} ${text.slice(0, 200)}`
    );
  }

  const data = await res.json();
  const items: YouTubePlaylistItem[] = (data.items || []).map(
    (item: {
      snippet: {
        resourceId: { videoId: string };
        title: string;
        publishedAt: string;
        thumbnails?: { medium?: { url: string } };
      };
    }) => ({
      videoId: item.snippet.resourceId.videoId,
      title: item.snippet.title,
      publishedAt: item.snippet.publishedAt,
      thumbnailUrl: item.snippet.thumbnails?.medium?.url || null,
    })
  );

  // First check: no previous video ID — return only the latest to set baseline
  if (!channel.last_checked_video_id) {
    return items.slice(0, 1);
  }

  // Return all videos up to (but not including) the last checked video
  const newVideos: YouTubePlaylistItem[] = [];
  for (const item of items) {
    if (item.videoId === channel.last_checked_video_id) break;
    newVideos.push(item);
  }

  return newVideos;
}

/**
 * Check all enabled monitored channels for new videos.
 * For each new video found:
 *   1. Send to Opus Clip via Zapier webhook (if auto_clip enabled)
 *   2. Update lastCheckedVideoId
 *   3. Log the activity
 */
export async function checkAllChannels(): Promise<{
  channelsChecked: number;
  newVideosFound: number;
  clipsSent: number;
  errors: string[];
}> {
  const { data: channels, error } = await supabase
    .from("monitored_channels")
    .select("*")
    .eq("enabled", true);

  if (error) {
    throw new Error(`Failed to fetch monitored channels: ${error.message}`);
  }

  if (!channels || channels.length === 0) {
    return { channelsChecked: 0, newVideosFound: 0, clipsSent: 0, errors: [] };
  }

  let totalNewVideos = 0;
  let totalSent = 0;
  const errors: string[] = [];

  for (const channel of channels as MonitoredChannel[]) {
    try {
      const newVideos = await getNewVideos(channel);

      if (newVideos.length === 0) {
        // Update last_checked_at even if no new videos
        await supabase
          .from("monitored_channels")
          .update({ last_checked_at: new Date().toISOString() })
          .eq("id", channel.id);
        continue;
      }

      console.log(
        `[youtube-monitor] ${channel.channel_name}: ${newVideos.length} new video(s) found`
      );

      totalNewVideos += newVideos.length;

      for (const video of newVideos) {
        const videoUrl = `https://www.youtube.com/watch?v=${video.videoId}`;

        if (channel.auto_clip) {
          try {
            const { projectId } = await sendToOpusClip(videoUrl);
            totalSent++;
            console.log(
              `[youtube-monitor] Sent to Opus Clip via Zapier: "${video.title}" -> project ${projectId}`
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            errors.push(
              `Failed to send "${video.title}" to Opus Clip: ${msg}`
            );
            console.error(
              `[youtube-monitor] Zapier webhook error for "${video.title}":`,
              msg
            );
          }
        }
      }

      // Update channel: set last checked to the newest video
      await supabase
        .from("monitored_channels")
        .update({
          last_checked_video_id: newVideos[0].videoId,
          last_checked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", channel.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Error checking ${channel.channel_name}: ${msg}`);
      console.error(
        `[youtube-monitor] Error checking ${channel.channel_name}:`,
        msg
      );
    }
  }

  return {
    channelsChecked: channels.length,
    newVideosFound: totalNewVideos,
    clipsSent: totalSent,
    errors,
  };
}

// --- Database CRUD ---

export async function listMonitoredChannels(): Promise<MonitoredChannel[]> {
  const { data, error } = await supabase
    .from("monitored_channels")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to list channels: ${error.message}`);
  return (data || []) as MonitoredChannel[];
}

export async function addMonitoredChannel(
  input: string
): Promise<MonitoredChannel> {
  const resolved = await resolveChannel(input);

  // Check if already exists
  const { data: existing } = await supabase
    .from("monitored_channels")
    .select("id")
    .eq("channel_id", resolved.channelId)
    .single();

  if (existing) {
    throw new Error(
      `Channel "${resolved.channelName}" is already being monitored`
    );
  }

  const { data, error } = await supabase
    .from("monitored_channels")
    .insert({
      channel_id: resolved.channelId,
      channel_name: resolved.channelName,
      uploads_playlist_id: resolved.uploadsPlaylistId,
    })
    .select()
    .single();

  if (error)
    throw new Error(`Failed to add channel: ${error.message}`);

  return data as MonitoredChannel;
}

export async function updateMonitoredChannel(
  id: string,
  updates: { enabled?: boolean; auto_clip?: boolean }
): Promise<MonitoredChannel> {
  const { data, error } = await supabase
    .from("monitored_channels")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error)
    throw new Error(`Failed to update channel: ${error.message}`);

  return data as MonitoredChannel;
}

export async function removeMonitoredChannel(id: string): Promise<void> {
  const { error } = await supabase
    .from("monitored_channels")
    .delete()
    .eq("id", id);

  if (error)
    throw new Error(`Failed to remove channel: ${error.message}`);
}
