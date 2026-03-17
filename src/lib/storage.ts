import { supabase } from "./supabase";

const CLIPS_BUCKET = "clips";
const THUMBNAILS_BUCKET = "thumbnails";
const RAW_VIDEOS_BUCKET = "raw-videos";

export async function uploadClip(
  filePath: string,
  fileBuffer: Buffer,
  contentType: string
): Promise<string> {
  const { error } = await supabase.storage
    .from(CLIPS_BUCKET)
    .upload(filePath, fileBuffer, { contentType, upsert: true });

  if (error) throw new Error(`Failed to upload clip: ${error.message}`);

  const { data } = supabase.storage.from(CLIPS_BUCKET).getPublicUrl(filePath);
  return data.publicUrl;
}

export async function uploadThumbnail(
  filePath: string,
  fileBuffer: Buffer
): Promise<string> {
  const { error } = await supabase.storage
    .from(THUMBNAILS_BUCKET)
    .upload(filePath, fileBuffer, { contentType: "image/png", upsert: true });

  if (error) throw new Error(`Failed to upload thumbnail: ${error.message}`);

  const { data } = supabase.storage.from(THUMBNAILS_BUCKET).getPublicUrl(filePath);
  return data.publicUrl;
}

/**
 * Upload raw video to Supabase Storage for archival.
 * Best-effort: returns storage path on success, null on failure (never blocks pipeline).
 */
export async function uploadRawVideo(
  filePath: string,
  fileBuffer: Buffer,
  contentType: string
): Promise<string | null> {
  try {
    const { error } = await supabase.storage
      .from(RAW_VIDEOS_BUCKET)
      .upload(filePath, fileBuffer, { contentType, upsert: true });

    if (error) {
      console.error(`Raw video upload failed: ${error.message}`);
      return null;
    }
    return filePath;
  } catch (err) {
    console.error("Raw video upload error:", err);
    return null;
  }
}

/**
 * Download raw video from Supabase Storage.
 * Returns the video buffer, or null if not found.
 */
export async function downloadRawVideo(
  filePath: string
): Promise<Buffer | null> {
  try {
    const { data, error } = await supabase.storage
      .from(RAW_VIDEOS_BUCKET)
      .download(filePath);

    if (error || !data) {
      console.error(`Raw video download failed: ${error?.message}`);
      return null;
    }
    return Buffer.from(await data.arrayBuffer());
  } catch (err) {
    console.error("Raw video download error:", err);
    return null;
  }
}

export async function deleteClip(filePath: string): Promise<void> {
  const { error } = await supabase.storage.from(CLIPS_BUCKET).remove([filePath]);
  if (error) throw new Error(`Failed to delete clip: ${error.message}`);
}

export async function getSignedUrl(
  bucket: string,
  filePath: string,
  expiresIn = 3600
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(filePath, expiresIn);

  if (error) throw new Error(`Failed to get signed URL: ${error.message}`);
  return data.signedUrl;
}
