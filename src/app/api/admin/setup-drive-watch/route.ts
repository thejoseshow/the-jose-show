import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { getAuthenticatedClient } from "@/lib/google-drive";
import { randomUUID } from "crypto";

// POST /api/admin/setup-drive-watch - Register Drive push notifications for the uploads folder
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret || authHeader !== `Bearer ${adminSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) {
    return NextResponse.json({ error: "Missing GOOGLE_DRIVE_FOLDER_ID" }, { status: 500 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    return NextResponse.json({ error: "Missing NEXT_PUBLIC_SITE_URL" }, { status: 500 });
  }

  try {
    const auth = await getAuthenticatedClient();
    const drive = google.drive({ version: "v3", auth });

    const channelId = randomUUID();
    const res = await drive.files.watch({
      fileId: folderId,
      requestBody: {
        id: channelId,
        type: "web_hook",
        address: `${siteUrl}/api/webhooks/drive`,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        channel_id: res.data.id,
        resource_id: res.data.resourceId,
        expiration: res.data.expiration
          ? new Date(Number(res.data.expiration)).toISOString()
          : null,
      },
    });
  } catch (err) {
    console.error("Failed to setup Drive watch:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
