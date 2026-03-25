import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  updateMonitoredChannel,
  removeMonitoredChannel,
} from "@/lib/youtube-monitor";

// PUT /api/channels/[id] - Update a channel (toggle enabled, auto_clip)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const updates: { enabled?: boolean; auto_clip?: boolean } = {};

    if (typeof body.enabled === "boolean") updates.enabled = body.enabled;
    if (typeof body.auto_clip === "boolean") updates.auto_clip = body.auto_clip;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const channel = await updateMonitoredChannel(id, updates);
    return NextResponse.json({ success: true, data: channel });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to update channel",
      },
      { status: 500 }
    );
  }
}

// DELETE /api/channels/[id] - Remove a channel
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await removeMonitoredChannel(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to remove channel",
      },
      { status: 500 }
    );
  }
}
