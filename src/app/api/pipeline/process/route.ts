import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { scanDriveForClips, importClip } from "@/lib/pipeline";

export const maxDuration = 300;

// POST /api/pipeline/process - Manual trigger: scan Drive for new Opus Clip exports and import them
export async function POST() {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Scan for new clips in the Opus Clip Drive folder
    const newClips = await scanDriveForClips();

    if (newClips.length === 0) {
      return NextResponse.json({
        success: true,
        new_files_detected: 0,
        processed: 0,
        message: "No new clips found in Opus Clip folder",
      });
    }

    let processed = 0;
    const errors: string[] = [];

    // Import clips sequentially
    for (const clip of newClips.slice(0, 10)) {
      try {
        const result = await importClip({
          driveFileId: clip.id,
          generateCopy: true,
        });

        if (result.status === "failed") {
          errors.push(`${clip.name}: ${result.error || "Unknown error"}`);
        } else {
          processed++;
        }
      } catch (err) {
        errors.push(
          `${clip.name}: ${err instanceof Error ? err.message : "Unknown error"}`
        );
      }
    }

    return NextResponse.json({
      success: true,
      new_files_detected: newClips.length,
      processed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
