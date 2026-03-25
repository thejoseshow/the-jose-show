import { NextRequest, NextResponse } from "next/server";
import { importClip } from "@/lib/pipeline";

export const maxDuration = 300; // 5 min for large imports

/**
 * POST /api/import/clips
 *
 * Import clips via multipart form data (direct file upload).
 * Drive-based imports have been replaced by Opus Clip API scheduling.
 */
export async function POST(request: NextRequest) {
  // Auth: Bearer ADMIN_SECRET
  const authHeader = request.headers.get("authorization");
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret || authHeader !== `Bearer ${adminSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = request.headers.get("content-type") || "";

  // --- Multipart upload ---
  if (contentType.includes("multipart/form-data")) {
    try {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      const sourceVideoId = formData.get("sourceVideoId") as string | null;

      if (!file) {
        return NextResponse.json(
          { error: "Missing 'file' in form data" },
          { status: 400 }
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await importClip({
        buffer,
        filename: file.name,
        mimeType: file.type || "video/mp4",
        sourceVideoId: sourceVideoId || undefined,
        generateCopy: true,
      });

      return NextResponse.json({ success: true, data: result });
    } catch (err) {
      console.error("Clip upload import failed:", err);
      return NextResponse.json(
        {
          success: false,
          error: err instanceof Error ? err.message : "Import failed",
        },
        { status: 500 }
      );
    }
  }

  return NextResponse.json(
    {
      error: "Unsupported content type. Use multipart/form-data for file uploads. For scheduling, use /api/opus-clip/schedule instead.",
    },
    { status: 400 }
  );
}
