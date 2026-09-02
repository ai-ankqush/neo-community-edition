import "server-only";
import crypto from "crypto";
import { cookies } from "next/headers";

/**
 * Dependency-free WebAuthn (passkeys). We rely on the browser's own getPublicKey() to hand us the
 * credential public key as SPKI at registration, so the server never parses CBOR/COSE — it just stores the
 * SPKI and, at login, verifies the assertion signature with Node's built-in crypto. No WebAuthn library.
 *
 * The ceremony challenge is held in a short-lived, HMAC-signed, httpOnly cookie (no table needed).
 */

export const WA_COOKIE = "sky_wa";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function secret(): Buffer {
  const s = process.env.SKY_SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SKY_SESSION_SECRET is not set — passkeys fail closed.");
  return Buffer.from(s);
}

export function rpId(): string {
  if (process.env.SKY_RP_ID) return process.env.SKY_RP_ID;
  try {
    return new URL(process.env.SKY_BASE_URL ?? "https://sky.neocontrol.ai").hostname;
  } catch {
    return "sky.neocontrol.ai";
  }
}

export function origin(): string {
  if (process.env.SKY_ORIGIN) return process.env.SKY_ORIGIN;
  return (process.env.SKY_BASE_URL ?? "https://sky.neocontrol.ai").replace(/\/$/, "");
}

export function b64url(buf: Buffer | Uint8Array): string {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}
function sha256(b: Buffer): Buffer {
  return crypto.createHash("sha256").update(b).digest();
}

type ChallengePurpose = "reg" | "auth";

/** Issue a fresh challenge, remember it (signed) in a cookie, and return it (base64url) for the client. */
export async function issueChallenge(purpose: ChallengePurpose, userId?: string): Promise<string> {
  const challenge = b64url(crypto.randomBytes(32));
  const exp = Date.now() + CHALLENGE_TTL_MS;
  const payload = `${purpose}:${userId ?? ""}:${challenge}:${exp}`;
  const mac = crypto.createHmac("sha256", secret()).update(payload).digest("hex");
  const jar = await cookies();
  jar.set(WA_COOKIE, `${payload}.${mac}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 300 });
  return challenge;
}

export interface ChallengeState {
  purpose: ChallengePurpose;
  userId: string;
  challenge: string;
}

/** Read + verify the challenge cookie, then clear it (single ceremony). */
export async function takeChallenge(): Promise<ChallengeState | null> {
  const jar = await cookies();
  const raw = jar.get(WA_COOKIE)?.value;
  if (!raw) return null;
  jar.delete(WA_COOKIE);
  const dot = raw.lastIndexOf(".");
  if (dot < 0) return null;
  const payload = raw.slice(0, dot);
  const mac = raw.slice(dot + 1);
  const expected = crypto.createHmac("sha256", secret()).update(payload).digest("hex");
  const a = Buffer.from(mac), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const [purpose, userId, challenge, expStr] = payload.split(":");
  if (Number(expStr) < Date.now()) return null;
  return { purpose: purpose as ChallengePurpose, userId, challenge };
}

export interface AssertionInput {
  spkiDer: Buffer;
  alg: number; // COSE alg: -7 ES256, -257 RS256
  authenticatorData: Buffer;
  clientDataJSON: Buffer;
  signature: Buffer;
}

export interface VerifyExpectation {
  challenge: string;
  origin: string;
  rpId: string;
}

/** Verify a WebAuthn assertion (login). Returns null on success, or a reason string on failure. */
export function verifyAssertion(a: AssertionInput, expected: VerifyExpectation): string | null {
  let clientData: { type?: string; challenge?: string; origin?: string };
  try {
    clientData = JSON.parse(a.clientDataJSON.toString("utf8"));
  } catch {
    return "malformed_client_data";
  }
  if (clientData.type !== "webauthn.get") return "type";
  if (clientData.challenge !== expected.challenge) return "challenge";
  if (clientData.origin !== expected.origin) return "origin";
  if (a.authenticatorData.length < 37) return "authdata";
  if (!a.authenticatorData.subarray(0, 32).equals(sha256(Buffer.from(expected.rpId)))) return "rpid";
  if (!(a.authenticatorData[32] & 0x01)) return "user_present";

  const signed = Buffer.concat([a.authenticatorData, sha256(a.clientDataJSON)]);
  let key: crypto.KeyObject;
  try {
    key = crypto.createPublicKey({ key: a.spkiDer, format: "der", type: "spki" });
  } catch {
    return "bad_key";
  }
  const ok = a.alg === -257 ? crypto.verify("RSA-SHA256", signed, key, a.signature) : crypto.verify("sha256", signed, key, a.signature);
  return ok ? null : "bad_signature";
}

/** Verify the registration clientDataJSON (type/challenge/origin). Public key comes from the browser SPKI. */
export function verifyRegistrationClientData(clientDataJSON: Buffer, expected: VerifyExpectation): string | null {
  let cd: { type?: string; challenge?: string; origin?: string };
  try {
    cd = JSON.parse(clientDataJSON.toString("utf8"));
  } catch {
    return "malformed_client_data";
  }
  if (cd.type !== "webauthn.create") return "type";
  if (cd.challenge !== expected.challenge) return "challenge";
  if (cd.origin !== expected.origin) return "origin";
  return null;
}
