import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { scanDriveForClips } from "@/lib/pipeline";

export const maxDuration = 300;

/**
 * POST /api/pipeline/process
 *
 * Legacy route: scan Drive for new Opus Clip exports.
 * Direct clip imports via Drive have been replaced by the Opus Clip API
 * scheduling workflow (/api/opus-clip/schedule).
 *
 * This route now only reports what's available in Drive — actual scheduling
 * is handled via the Opus Clip projects UI or the process-uploads cron.
 */
export async function POST() {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Scan for new clips in the Opus Clip Drive folder
    const newClips = await scanDriveForClips();

    return NextResponse.json({
      success: true,
      new_files_detected: newClips.length,
      files: newClips.slice(0, 20).map((c) => ({
        id: c.id,
        name: c.name,
        size: c.size,
        createdTime: c.createdTime,
      })),
      message:
        newClips.length === 0
          ? "No new clips found in Opus Clip folder"
          : `Found ${newClips.length} new clip(s). Use the Schedule page or Opus Clip API to schedule them.`,
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
