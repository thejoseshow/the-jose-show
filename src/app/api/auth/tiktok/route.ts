import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { exchangeTikTokCode, getTikTokAuthUrl } from "@/lib/tiktok";

// GET /api/auth/tiktok - TikTok OAuth flow
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const code = request.nextUrl.searchParams.get("code");

  if (code) {
    try {
      await exchangeTikTokCode(code);
      return NextResponse.redirect(new URL("/dashboard/settings?tiktok=connected", request.url));
    } catch (error) {
      console.error("TikTok OAuth error:", error);
      return NextResponse.redirect(new URL("/dashboard/settings?tiktok=error", request.url));
    }
  }

  return NextResponse.redirect(getTikTokAuthUrl());
}
