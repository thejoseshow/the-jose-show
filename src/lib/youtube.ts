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
        defaultLanguage: "en",
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

export async function getVideoAnalytics(videoId: string) {
  const auth = await getAuthenticatedClient();
  const youtube = google.youtube({ version: "v3", auth });

  const response = await youtube.videos.list({
    part: ["statistics", "snippet"],
    id: [videoId],
  });

  const video = response.data.items?.[0];
  if (!video) return null;

  return {
    views: parseInt(video.statistics?.viewCount || "0", 10),
    likes: parseInt(video.statistics?.likeCount || "0", 10),
    comments: parseInt(video.statistics?.commentCount || "0", 10),
    shares: 0, // Not available via basic stats
  };
}

export async function deleteYouTubeVideo(videoId: string) {
  const auth = await getAuthenticatedClient();
  const youtube = google.youtube({ version: "v3", auth });
  await youtube.videos.delete({ id: videoId });
}
