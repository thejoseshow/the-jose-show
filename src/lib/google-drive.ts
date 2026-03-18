import { google } from "googleapis";
import { supabase } from "./supabase";
import type { PlatformToken } from "./types";

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export async function getAuthenticatedClient() {
  const { data: tokenRow } = await supabase
    .from("platform_tokens")
    .select("*")
    .eq("platform", "google")
    .single();

  if (!tokenRow) throw new Error("No Google token found. Please authenticate first.");

  const token = tokenRow as PlatformToken;
  const oauth2Client = getOAuth2Client();

  oauth2Client.setCredentials({
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expiry_date: token.expires_at ? new Date(token.expires_at).getTime() : undefined,
  });

  // Auto-refresh if expired
  oauth2Client.on("tokens", async (tokens) => {
    await supabase
      .from("platform_tokens")
      .update({
        access_token: tokens.access_token || token.access_token,
        expires_at: tokens.expiry_date
          ? new Date(tokens.expiry_date).toISOString()
          : token.expires_at,
        updated_at: new Date().toISOString(),
      })
      .eq("id", token.id);
  });

  return oauth2Client;
}

export function getAuthUrl(): string {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube",
    ],
  });
}

export async function exchangeCodeForTokens(code: string) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  // Upsert the google token
  const { error } = await supabase.from("platform_tokens").upsert(
    {
      platform: "google",
      access_token: tokens.access_token!,
      refresh_token: tokens.refresh_token || null,
      expires_at: tokens.expiry_date
        ? new Date(tokens.expiry_date).toISOString()
        : null,
      scopes: tokens.scope?.split(" ") || [],
      updated_at: new Date().toISOString(),
    },
    { onConflict: "platform" }
  );

  if (error) throw new Error(`Failed to save Google token: ${error.message}`);
  return tokens;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  createdTime: string;
  modifiedTime: string;
  isPhoto: boolean;
}

export async function listNewFiles(): Promise<DriveFile[]> {
  const auth = await getAuthenticatedClient();
  const drive = google.drive({ version: "v3", auth });
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!folderId) throw new Error("Missing GOOGLE_DRIVE_FOLDER_ID");

  // Get files already tracked (by Drive ID and filename to prevent duplicates)
  const { data: existingVideos } = await supabase
    .from("videos")
    .select("google_drive_file_id, filename");
  const existingIds = new Set(
    (existingVideos || []).map((v) => v.google_drive_file_id)
  );
  const existingFilenames = new Set(
    (existingVideos || []).map((v) => v.filename)
  );

  const response = await drive.files.list({
    q: `'${folderId}' in parents and (mimeType contains 'video/' or mimeType contains 'image/') and trashed=false`,
    fields: "files(id,name,mimeType,size,createdTime,modifiedTime)",
    orderBy: "createdTime desc",
    pageSize: 20,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });

  const rawFiles = (response.data.files || []) as Omit<DriveFile, "isPhoto">[];
  return rawFiles
    .filter((f) => !existingIds.has(f.id) && !existingFilenames.has(f.name))
    .map((f) => ({ ...f, isPhoto: f.mimeType.startsWith("image/") }));
}

export async function downloadFile(
  fileId: string,
  onProgress?: (bytes: number) => void
): Promise<Buffer> {
  const auth = await getAuthenticatedClient();
  const drive = google.drive({ version: "v3", auth });

  const response = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" }
  );

  const buffer = Buffer.from(response.data as ArrayBuffer);
  onProgress?.(buffer.length);
  return buffer;
}

export async function getFileMetadata(fileId: string) {
  const auth = await getAuthenticatedClient();
  const drive = google.drive({ version: "v3", auth });

  const response = await drive.files.get({
    fileId,
    fields: "id,name,mimeType,size,videoMediaMetadata,createdTime",
    supportsAllDrives: true,
  });

  return response.data;
}
