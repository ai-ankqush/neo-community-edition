import "server-only";
import crypto from "crypto";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Neo-native Sky sessions. The cookie carries only a signed reference to a row in sky_sessions, so a
 * session is revocable server-side (logout, admin kill) regardless of cookie lifetime. No identity vendor.
 */
export const SKY_COOKIE = "sky_session";
const DEFAULT_TTL_DAYS = 30;

function secret(): Buffer {
  const s = process.env.SKY_SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SKY_SESSION_SECRET is not set (min 32 chars) — Sky sessions fail closed.");
  return Buffer.from(s);
}

function signRef(sessionId: string): string {
  const mac = crypto.createHmac("sha256", secret()).update(sessionId).digest("hex");
  return `${sessionId}.${mac}`;
}

function verifyRef(value: string): string | null {
  const dot = value.lastIndexOf(".");
  if (dot < 0) return null;
  const sessionId = value.slice(0, dot);
  const mac = value.slice(dot + 1);
  const expected = crypto.createHmac("sha256", secret()).update(sessionId).digest("hex");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return sessionId;
}

export interface SkySessionRow {
  sessionId: string;
  userId: string;
  orgId: string;
}

export async function createSession(input: { userId: string; orgId: string; ttlDays?: number; userAgent?: string; ip?: string }): Promise<void> {
  const expiresAt = new Date(Date.now() + (input.ttlDays ?? DEFAULT_TTL_DAYS) * 86400_000);
  const { data, error } = await supabaseAdmin()
    .from("sky_sessions")
    .insert({ user_id: input.userId, org_id: input.orgId, expires_at: expiresAt.toISOString(), user_agent: input.userAgent ?? null, ip: input.ip ?? null })
    .select("session_id")
    .single();
  if (error || !data) throw error ?? new Error("Failed to create session.");

  const jar = await cookies();
  jar.set(SKY_COOKIE, signRef(data.session_id as string), {
    httpOnly: true,
    // secure only over HTTPS — a self-hosted CE on http://localhost must still receive the cookie.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** Read + validate the current session (expiry + revocation checked against the DB). */
export async function readSession(): Promise<SkySessionRow | null> {
  const jar = await cookies();
  const raw = jar.get(SKY_COOKIE)?.value;
  if (!raw) return null;
  const sessionId = verifyRef(raw);
  if (!sessionId) return null;

  const { data } = await supabaseAdmin()
    .from("sky_sessions")
    .select("session_id, user_id, org_id, expires_at, revoked_at")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (!data) return null;
  if (data.revoked_at) return null;
  if (new Date(data.expires_at as string).getTime() < Date.now()) return null;

  return { sessionId: data.session_id as string, userId: data.user_id as string, orgId: data.org_id as string };
}

export async function revokeSession(sessionId: string): Promise<void> {
  await supabaseAdmin().from("sky_sessions").update({ revoked_at: new Date().toISOString() }).eq("session_id", sessionId).is("revoked_at", null);
}

/** Revoke the caller's current session and clear the cookie. */
export async function destroyCurrentSession(): Promise<void> {
  const jar = await cookies();
  const raw = jar.get(SKY_COOKIE)?.value;
  if (raw) {
    const sessionId = verifyRef(raw);
    if (sessionId) await revokeSession(sessionId);
  }
  jar.delete(SKY_COOKIE);
}
