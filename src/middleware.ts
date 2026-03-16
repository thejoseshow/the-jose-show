import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC_PATHS = ["/login", "/api/auth", "/api/cron", "/api/webhooks"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return addSecurityHeaders(NextResponse.next());
  }

  // Allow static assets and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/"
  ) {
    return addSecurityHeaders(NextResponse.next());
  }

  // Check session for dashboard and API routes
  const token = request.cookies.get("tjs_session")?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const secret = new TextEncoder().encode(process.env.SESSION_SECRET);
    await jwtVerify(token, secret);
    return addSecurityHeaders(NextResponse.next());
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/content/:path*", "/api/publish/:path*", "/api/pipeline/:path*", "/api/events/:path*", "/api/analytics/:path*", "/api/thumbnails/:path*", "/api/connections/:path*", "/api/settings/:path*", "/api/suggestions/:path*", "/api/dashboard/:path*", "/api/admin/:path*", "/api/remotion/:path*", "/api/templates/:path*"],
};
