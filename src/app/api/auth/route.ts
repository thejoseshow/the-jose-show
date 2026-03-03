import { NextRequest, NextResponse } from "next/server";
import { createSession, setSessionCookie, clearSession, verifyPassword } from "@/lib/auth";
import { authSchema, sanitizeError } from "@/lib/validation";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  // Rate limiting: 5 attempts per 15 min per IP
  const ip = getClientIp(request);
  const { allowed, retryAfterMs } = checkRateLimit(`auth:${ip}`);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: "Too many login attempts. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
      }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = authSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Password required" },
        { status: 400 }
      );
    }

    const valid = await verifyPassword(parsed.data.password);
    if (!valid) {
      return NextResponse.json(
        { success: false, error: "Invalid password" },
        { status: 401 }
      );
    }

    const token = await createSession();
    await setSessionCookie(token);

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = sanitizeError(error, "auth:POST");
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  await clearSession();
  return NextResponse.json({ success: true });
}
