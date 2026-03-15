import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getAuthenticatedClient } from "@/lib/google-drive";
import { google } from "googleapis";

// GET /api/pipeline/debug-drive - Test Drive folder access
export async function GET() {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  try {
    const auth = await getAuthenticatedClient();
    const drive = google.drive({ version: "v3", auth });

    // Test 1: Try to access the folder itself
    let folderInfo;
    try {
      const folderRes = await drive.files.get({
        fileId: folderId!,
        fields: "id,name,mimeType,owners,shared",
        supportsAllDrives: true,
      });
      folderInfo = folderRes.data;
    } catch (err: unknown) {
      const error = err as { code?: number; message?: string; errors?: unknown[] };
      return NextResponse.json({
        success: false,
        step: "folder_access",
        folder_id: folderId,
        error_code: error.code,
        error_message: error.message,
        error_details: error.errors,
      });
    }

    // Test 2: List files in the folder
    let files: { id?: string | null; name?: string | null; mimeType?: string | null; size?: string | null }[] | undefined;
    try {
      const listRes = await drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: "files(id,name,mimeType,size)",
        pageSize: 10,
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
      });
      files = listRes.data.files;
    } catch (err: unknown) {
      const error = err as { code?: number; message?: string; errors?: unknown[] };
      return NextResponse.json({
        success: false,
        step: "list_files",
        folder_id: folderId,
        folder_name: folderInfo?.name,
        error_code: error.code,
        error_message: error.message,
        error_details: error.errors,
      });
    }

    return NextResponse.json({
      success: true,
      folder_id: folderId,
      folder_name: folderInfo?.name,
      folder_shared: folderInfo?.shared,
      files_found: files?.length || 0,
      files: files?.map((f) => ({ name: f.name, type: f.mimeType, size: f.size })),
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      step: "auth",
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
