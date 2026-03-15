import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

// GET /api/admin/storage-cleanup - Get storage usage stats
export async function GET() {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // List files in both buckets
    const [clipsResult, thumbsResult] = await Promise.all([
      supabase.storage.from("clips").list("", { limit: 1000, sortBy: { column: "created_at", order: "desc" } }),
      supabase.storage.from("thumbnails").list("", { limit: 1000, sortBy: { column: "created_at", order: "desc" } }),
    ]);

    // Count files recursively (Supabase storage list returns folders at root)
    const clipFiles = await listAllFiles("clips");
    const thumbFiles = await listAllFiles("thumbnails");

    // Get referenced paths from DB
    const [clipPaths, thumbPaths] = await Promise.all([
      getReferencedClipPaths(),
      getReferencedThumbnailPaths(),
    ]);

    const orphanedClips = clipFiles.filter((f) => !clipPaths.has(f.path));
    const orphanedThumbs = thumbFiles.filter((f) => !thumbPaths.has(f.path));

    const totalBytes = [...clipFiles, ...thumbFiles].reduce((sum, f) => sum + (f.size || 0), 0);
    const orphanedBytes = [...orphanedClips, ...orphanedThumbs].reduce((sum, f) => sum + (f.size || 0), 0);

    return NextResponse.json({
      success: true,
      data: {
        total_files: clipFiles.length + thumbFiles.length,
        total_bytes: totalBytes,
        orphaned_clips: orphanedClips.length,
        orphaned_thumbnails: orphanedThumbs.length,
        orphaned_bytes: orphanedBytes,
        bucket_error: clipsResult.error?.message || thumbsResult.error?.message || null,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// POST /api/admin/storage-cleanup - Delete orphaned files
export async function POST() {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const clipFiles = await listAllFiles("clips");
    const thumbFiles = await listAllFiles("thumbnails");

    const [clipPaths, thumbPaths] = await Promise.all([
      getReferencedClipPaths(),
      getReferencedThumbnailPaths(),
    ]);

    const orphanedClips = clipFiles.filter((f) => !clipPaths.has(f.path));
    const orphanedThumbs = thumbFiles.filter((f) => !thumbPaths.has(f.path));

    let deletedClips = 0;
    let deletedThumbnails = 0;
    let freedBytes = 0;

    // Delete orphaned clips
    if (orphanedClips.length > 0) {
      const paths = orphanedClips.map((f) => f.path);
      const { error } = await supabase.storage.from("clips").remove(paths);
      if (!error) {
        deletedClips = paths.length;
        freedBytes += orphanedClips.reduce((sum, f) => sum + (f.size || 0), 0);
      }
    }

    // Delete orphaned thumbnails
    if (orphanedThumbs.length > 0) {
      const paths = orphanedThumbs.map((f) => f.path);
      const { error } = await supabase.storage.from("thumbnails").remove(paths);
      if (!error) {
        deletedThumbnails = paths.length;
        freedBytes += orphanedThumbs.reduce((sum, f) => sum + (f.size || 0), 0);
      }
    }

    return NextResponse.json({
      success: true,
      deleted_clips: deletedClips,
      deleted_thumbnails: deletedThumbnails,
      freed_bytes: freedBytes,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

interface StorageFile {
  path: string;
  size: number;
}

async function listAllFiles(bucket: string): Promise<StorageFile[]> {
  const files: StorageFile[] = [];

  // List top-level (folders like clips/videoId/)
  const { data: folders } = await supabase.storage.from(bucket).list("", { limit: 1000 });
  if (!folders) return files;

  for (const item of folders) {
    if (item.metadata) {
      // It's a file at root level
      files.push({ path: item.name, size: item.metadata.size || 0 });
    } else {
      // It's a folder — list its contents
      const { data: subFiles } = await supabase.storage.from(bucket).list(item.name, { limit: 1000 });
      if (subFiles) {
        for (const sub of subFiles) {
          if (sub.metadata) {
            files.push({ path: `${item.name}/${sub.name}`, size: sub.metadata.size || 0 });
          }
        }
      }
    }
  }

  return files;
}

async function getReferencedClipPaths(): Promise<Set<string>> {
  const { data } = await supabase
    .from("clips")
    .select("storage_path")
    .not("storage_path", "is", null);

  const paths = new Set<string>();
  for (const row of data || []) {
    if (row.storage_path) {
      // storage_path is like "clips/videoId/file.mp4" — strip the bucket prefix
      const path = row.storage_path.startsWith("clips/")
        ? row.storage_path.slice("clips/".length)
        : row.storage_path;
      paths.add(path);
    }
  }
  return paths;
}

async function getReferencedThumbnailPaths(): Promise<Set<string>> {
  const { data } = await supabase
    .from("content")
    .select("thumbnail_url")
    .not("thumbnail_url", "is", null);

  const paths = new Set<string>();
  for (const row of data || []) {
    if (row.thumbnail_url) {
      // thumbnail_url could be a full URL or a path — extract the storage path
      const match = row.thumbnail_url.match(/thumbnails\/(.+)/);
      if (match) paths.add(match[1]);
    }
  }
  return paths;
}
