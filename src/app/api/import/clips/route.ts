import { NextRequest, NextResponse } from "next/server";
import { importClip } from "@/lib/pipeline";
import { processImportBatch } from "@/lib/opus-clip";

export const maxDuration = 300; // 5 min for large imports

/**
 * POST /api/import/clips
 *
 * Import clips via:
 * 1. Multipart form data (direct file upload)
 * 2. JSON body with driveFileIds array (Google Drive import)
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

  // --- JSON body with Drive file IDs ---
  try {
    const body = await request.json();
    const { driveFileIds, sourceVideoId } = body as {
      driveFileIds?: string[];
      sourceVideoId?: string;
    };

    if (!driveFileIds || !Array.isArray(driveFileIds) || driveFileIds.length === 0) {
      return NextResponse.json(
        { error: "Missing or empty 'driveFileIds' array" },
        { status: 400 }
      );
    }

    // Cap at 20 files per request to stay within timeout
    if (driveFileIds.length > 20) {
      return NextResponse.json(
        { error: "Maximum 20 files per import request" },
        { status: 400 }
      );
    }

    const results = await processImportBatch(driveFileIds, sourceVideoId);

    const imported = results.filter((r) => r.status !== "failed").length;
    const failed = results.filter((r) => r.status === "failed").length;

    return NextResponse.json({
      success: true,
      data: {
        total: results.length,
        imported,
        failed,
        results,
      },
    });
  } catch (err) {
    console.error("Clip Drive import failed:", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Import failed",
      },
      { status: 500 }
    );
  }
}
