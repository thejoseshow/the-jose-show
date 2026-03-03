import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { exchangeMetaCode, getMetaAuthUrl } from "@/lib/meta";

// GET /api/auth/meta - Meta (Facebook + Instagram) OAuth flow
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const code = request.nextUrl.searchParams.get("code");

  if (code) {
    try {
      await exchangeMetaCode(code);
      return NextResponse.redirect(
        new URL("/dashboard/settings?meta=connected", request.url)
      );
    } catch (error) {
      console.error("Meta OAuth error:", error);
      return NextResponse.redirect(
        new URL("/dashboard/settings?meta=error", request.url)
      );
    }
  }

  return NextResponse.redirect(getMetaAuthUrl());
}
