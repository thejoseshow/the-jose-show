import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import type { SessionPayload } from "./types";

const SESSION_COOKIE = "tjs_session";
const SESSION_DURATION_HOURS = 72;

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Missing SESSION_SECRET");
  return new TextEncoder().encode(secret);
}

export async function createSession(): Promise<string> {
  const token = await new SignJWT({ authenticated: true } satisfies Omit<SessionPayload, "exp">)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${SESSION_DURATION_HOURS}h`)
    .sign(getSecret());
  return token;
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DURATION_HOURS * 60 * 60,
    path: "/",
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function verifyPassword(password: string): Promise<boolean> {
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash) throw new Error("Missing ADMIN_PASSWORD_HASH");
  return bcrypt.compare(password, hash);
}

export function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !authHeader) return false;

  const expected = `Bearer ${cronSecret}`;
  if (authHeader.length !== expected.length) return false;

  try {
    return timingSafeEqual(
      Buffer.from(authHeader),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

/**
 * Generate a bcrypt hash for a password (utility for setting up env vars).
 * Usage: node -e "const b=require('bcryptjs');b.hash('yourpass',12).then(console.log)"
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}
