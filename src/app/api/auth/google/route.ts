import { NextRequest, NextResponse } from "next/server";
import { getAuthUrl, exchangeCodeForTokens } from "@/lib/google-drive";
import { getSession } from "@/lib/auth";

// GET /api/auth/google - Redirect to Google OAuth
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const code = request.nextUrl.searchParams.get("code");

  if (code) {
    // OAuth callback - exchange code for tokens
    try {
      await exchangeCodeForTokens(code);
      return NextResponse.redirect(
        new URL("/dashboard/settings?google=connected", request.url)
      );
    } catch (error) {
      console.error("Google OAuth error:", error);
      return NextResponse.redirect(
        new URL("/dashboard/settings?google=error", request.url)
      );
    }
  }

  // Start OAuth flow
  const authUrl = getAuthUrl();
  return NextResponse.redirect(authUrl);
}
