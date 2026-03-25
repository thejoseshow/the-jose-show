import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth";
import { scanDriveForClips, importClip } from "@/lib/pipeline";

export const maxDuration = 300; // 5 min

/**
 * GET /api/cron/process-uploads
 *
 * Scans the Opus Clip Drive folder (configured via app_settings.opus_clip_drive_folder)
 * for new clip files. Imports each through the pipeline and generates AI copy.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Scan for new clips in the Opus Clip Drive folder
    const newClips = await scanDriveForClips();

    if (newClips.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No new clips found",
        processed: 0,
      });
    }

    console.log(`Found ${newClips.length} new clips to import`);

    const results = [];
    let imported = 0;
    let failed = 0;

    // Process clips sequentially to avoid overwhelming resources
    for (const clip of newClips) {
      try {
        console.log(`Importing: ${clip.name} (${clip.id})`);

        const result = await importClip({
          driveFileId: clip.id,
          generateCopy: true,
        });

        results.push({
          filename: clip.name,
          driveFileId: clip.id,
          ...result,
        });

        if (result.status === "failed") {
          failed++;
          console.error(`Failed to import ${clip.name}: ${result.error}`);
        } else {
          imported++;
          console.log(`Imported ${clip.name} -> video ${result.videoId}`);
        }
      } catch (err) {
        failed++;
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`Error importing ${clip.name}:`, errorMsg);
        results.push({
          filename: clip.name,
          driveFileId: clip.id,
          status: "failed",
          error: errorMsg,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${newClips.length} clips: ${imported} imported, ${failed} failed`,
      processed: imported,
      failed,
      results,
    });
  } catch (err) {
    console.error("process-uploads cron error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Cron failed",
        processed: 0,
      },
      { status: 500 }
    );
  }
}
