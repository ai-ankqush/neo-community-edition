import "server-only";
import crypto from "crypto";
import { cookies } from "next/headers";

/**
 * The gap between "password accepted" and "session issued". When a user has 2FA on, the first factor
 * only earns a short-lived, signed, httpOnly challenge — never a session. The session is created solely
 * after the second factor verifies, so a stolen password alone gets nothing.
 */
const COOKIE = "sky_mfa";
const TTL_MS = 5 * 60 * 1000;

function secret(): Buffer {
  const s = process.env.SKY_SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SKY_SESSION_SECRET is not set — 2FA fails closed.");
  return Buffer.from(s);
}

export async function issueChallenge(userId: string, orgId: string): Promise<void> {
  const exp = Date.now() + TTL_MS;
  const payload = `${userId}:${orgId}:${exp}`;
  const mac = crypto.createHmac("sha256", secret()).update(payload).digest("hex");
  const jar = await cookies();
  jar.set(COOKIE, `${payload}.${mac}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 300 });
}

export interface Challenge {
  userId: string;
  orgId: string;
}

/** Read + verify the pending challenge. Pass consume=true to clear it once used. */
export async function readChallenge(consume = false): Promise<Challenge | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return null;
  if (consume) jar.delete(COOKIE);

  const dot = raw.lastIndexOf(".");
  if (dot < 0) return null;
  const payload = raw.slice(0, dot);
  const mac = raw.slice(dot + 1);
  const expected = crypto.createHmac("sha256", secret()).update(payload).digest("hex");
  const a = Buffer.from(mac), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const [userId, orgId, expStr] = payload.split(":");
  if (Number(expStr) < Date.now()) return null;
  return { userId, orgId };
}

export async function clearChallenge(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}
