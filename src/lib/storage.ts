import { supabase } from "./supabase";

const CLIPS_BUCKET = "clips";
const THUMBNAILS_BUCKET = "thumbnails";

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
