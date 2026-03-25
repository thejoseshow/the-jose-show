import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  listMonitoredChannels,
  addMonitoredChannel,
  removeMonitoredChannel,
} from "@/lib/youtube-monitor";

// GET /api/channels - List all monitored channels
export async function GET() {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const channels = await listMonitoredChannels();
    return NextResponse.json({ success: true, data: channels });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to list channels",
      },
      { status: 500 }
    );
  }
}

// POST /api/channels - Add a channel to monitor
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { input } = await request.json();
    if (!input || typeof input !== "string") {
      return NextResponse.json(
        { success: false, error: "Missing channel URL, handle, or ID" },
        { status: 400 }
      );
    }

    const channel = await addMonitoredChannel(input);
    return NextResponse.json({ success: true, data: channel });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to add channel",
      },
      { status: 400 }
    );
  }
}

// DELETE /api/channels?id=xxx - Remove a channel
export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { success: false, error: "Missing channel id" },
      { status: 400 }
    );
  }

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
