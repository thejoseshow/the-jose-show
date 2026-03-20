import { google } from "googleapis";
import { Readable } from "stream";
import { getAuthenticatedClient } from "./google-drive";
import { supabase } from "./supabase";

interface YouTubeUploadParams {
  title: string;
  description: string;
  tags?: string[];
  categoryId?: string; // 22 = People & Blogs, 10 = Music, 24 = Entertainment
  privacyStatus?: "private" | "unlisted" | "public";
  videoBuffer: Buffer;
  thumbnailBuffer?: Buffer;
  language?: string;
}

export async function uploadToYouTube(params: YouTubeUploadParams): Promise<string> {
  const {
    title,
    description,
    tags = [],
    categoryId = "24", // Entertainment
    privacyStatus = "public",
    videoBuffer,
    thumbnailBuffer,
    language = "en",
  } = params;

  const auth = await getAuthenticatedClient();
  const youtube = google.youtube({ version: "v3", auth });

  // Upload video
  const videoStream = Readable.from(videoBuffer);
  const response = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title,
        description,
        tags,
        categoryId,
        defaultLanguage: language,
      },
      status: {
        privacyStatus,
        selfDeclaredMadeForKids: false,
      },
    },
    media: {
      body: videoStream,
    },
  });

  const videoId = response.data.id;
  if (!videoId) throw new Error("YouTube upload failed: no video ID returned");

  // Upload custom thumbnail if provided
  if (thumbnailBuffer) {
    try {
      await youtube.thumbnails.set({
        videoId,
        media: {
          mimeType: "image/png",
          body: Readable.from(thumbnailBuffer),
        },
      });
    } catch (err) {
      console.error("Thumbnail upload failed (video still published):", err);
    }
  }

  return videoId;
}

/**
 * Parse ISO 8601 duration (e.g. "PT1M30S") to seconds.
 */
function parseISO8601Duration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);
  return hours * 3600 + minutes * 60 + seconds;
}

export async function getVideoAnalytics(videoId: string) {
  const auth = await getAuthenticatedClient();
  const youtube = google.youtube({ version: "v3", auth });

  const response = await youtube.videos.list({
    part: ["statistics", "snippet", "contentDetails"],
    id: [videoId],
  });

  const video = response.data.items?.[0];
  if (!video) return null;

  const durationSeconds = video.contentDetails?.duration
    ? parseISO8601Duration(video.contentDetails.duration)
    : 0;

  return {
    views: parseInt(video.statistics?.viewCount || "0", 10),
    likes: parseInt(video.statistics?.likeCount || "0", 10),
    comments: parseInt(video.statistics?.commentCount || "0", 10),
    // YouTube Data API v3 (videos.list) doesn't expose share counts.
    // Would require YouTube Analytics API with yt-analytics.readonly scope.
    shares: 0,
    durationSeconds,
  };
}

export async function deleteYouTubeVideo(videoId: string) {
  const auth = await getAuthenticatedClient();
  const youtube = google.youtube({ version: "v3", auth });
  await youtube.videos.delete({ id: videoId });
}
