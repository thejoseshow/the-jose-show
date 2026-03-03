import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

const VALID_PLATFORMS = ["google", "facebook", "tiktok"] as const;

// GET /api/connections - Full connection status for each platform
export async function GET() {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connections = [];

  for (const platform of VALID_PLATFORMS) {
    const { data: token } = await supabase
      .from("platform_tokens")
      .select("expires_at, scopes, updated_at")
      .eq("platform", platform)
      .single();

    const connected = !!token;
    let daysUntilExpiry: number | null = null;

    if (token?.expires_at) {
      const diff = new Date(token.expires_at).getTime() - Date.now();
      daysUntilExpiry = Math.floor(diff / (1000 * 60 * 60 * 24));
    }

    connections.push({
      platform,
      connected,
      expires_at: token?.expires_at || null,
      days_until_expiry: daysUntilExpiry,
      scopes: token?.scopes || null,
      last_refreshed: token?.updated_at || null,
    });
  }

  return NextResponse.json({ success: true, data: connections });
}

// DELETE /api/connections?platform=google|facebook|tiktok - Disconnect a platform
export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const platform = request.nextUrl.searchParams.get("platform");

  if (!platform || !VALID_PLATFORMS.includes(platform as (typeof VALID_PLATFORMS)[number])) {
    return NextResponse.json(
      { error: "Invalid platform. Must be one of: google, facebook, tiktok" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("platform_tokens")
    .delete()
    .eq("platform", platform);

  if (error) {
    return NextResponse.json(
      { error: `Failed to disconnect: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, message: `${platform} disconnected` });
}
