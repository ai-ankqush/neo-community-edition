import "server-only";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Two-factor authentication (TOTP, RFC 4226/6238) — dependency-free, on Node crypto.
 *
 * Secrets are encrypted at rest with AES-256-GCM (key derived from SKY_SESSION_SECRET), so a database
 * leak alone doesn't yield working second factors. Recovery codes are stored only as SHA-256 hashes and
 * are single-use. Verification allows ±1 time step for clock drift.
 */

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;
const WINDOW = 1;

export function base32Encode(buf: Buffer): string {
  let bits = 0, val = 0, out = "";
  for (const b of buf) {
    val = (val << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0, val = 0;
  const out: number[] = [];
  for (const c of clean) {
    const i = B32.indexOf(c);
    if (i < 0) throw new Error("Invalid base32.");
    val = (val << 5) | i; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac("sha1", secret).update(buf).digest();
  const off = h[h.length - 1] & 0x0f;
  const code = ((h[off] & 0x7f) << 24) | ((h[off + 1] & 0xff) << 16) | ((h[off + 2] & 0xff) << 8) | (h[off + 3] & 0xff);
  return String(code % 10 ** DIGITS).padStart(DIGITS, "0");
}

/** Constant-time compare of two codes, tolerant of ±WINDOW steps of clock drift. */
export function verifyCode(secret: Buffer, code: string, at: number = Date.now()): boolean {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  const counter = Math.floor(at / 1000 / STEP_SECONDS);
  for (let w = -WINDOW; w <= WINDOW; w++) {
    const candidate = hotp(secret, counter + w);
    if (crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(clean))) return true;
  }
  return false;
}

/* ---------------------------- secret at rest ---------------------------- */

function key(): Buffer {
  const s = process.env.SKY_SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SKY_SESSION_SECRET is not set — 2FA fails closed.");
  return crypto.createHash("sha256").update(`totp:${s}`).digest();
}
function encryptSecret(secret: Buffer): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(secret), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64");
}
function decryptSecret(stored: string): Buffer {
  const raw = Buffer.from(stored, "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]);
}

function issuer(): string {
  return "Neo Sky";
}
export function otpauthUri(email: string, secretB32: string): string {
  const label = encodeURIComponent(`${issuer()}:${email}`);
  const params = new URLSearchParams({ secret: secretB32, issuer: issuer(), algorithm: "SHA1", digits: String(DIGITS), period: String(STEP_SECONDS) });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/* ------------------------------- lifecycle ------------------------------- */

export interface EnrollmentStart {
  secretB32: string;
  otpauth: string;
}

/** Begin enrollment: generate + store an UNCONFIRMED secret. Replaces any pending one. */
export async function startEnrollment(userId: string, email: string): Promise<EnrollmentStart> {
  const secret = crypto.randomBytes(20);
  const secretB32 = base32Encode(secret);
  await supabaseAdmin()
    .from("sky_totp")
    .upsert({ user_id: userId, secret_encrypted: encryptSecret(secret), confirmed_at: null, created_at: new Date().toISOString() }, { onConflict: "user_id" });
  return { secretB32, otpauth: otpauthUri(email, secretB32) };
}

/** Confirm enrollment with a live code, then mint fresh single-use recovery codes. */
export async function confirmEnrollment(userId: string, code: string): Promise<{ ok: boolean; recoveryCodes?: string[] }> {
  const sb = supabaseAdmin();
  const { data } = await sb.from("sky_totp").select("secret_encrypted").eq("user_id", userId).maybeSingle();
  if (!data) return { ok: false };
  if (!verifyCode(decryptSecret(data.secret_encrypted as string), code)) return { ok: false };

  await sb.from("sky_totp").update({ confirmed_at: new Date().toISOString() }).eq("user_id", userId);
  const recoveryCodes = await regenerateRecoveryCodes(userId);
  return { ok: true, recoveryCodes };
}

export async function isTotpEnabled(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin().from("sky_totp").select("confirmed_at").eq("user_id", userId).maybeSingle();
  return !!data?.confirmed_at;
}

/** Verify a live TOTP code for a user with confirmed 2FA. */
export async function verifyForUser(userId: string, code: string): Promise<boolean> {
  const { data } = await supabaseAdmin().from("sky_totp").select("secret_encrypted, confirmed_at").eq("user_id", userId).maybeSingle();
  if (!data?.confirmed_at) return false;
  return verifyCode(decryptSecret(data.secret_encrypted as string), code);
}

export async function disableTotp(userId: string): Promise<void> {
  const sb = supabaseAdmin();
  await sb.from("sky_totp").delete().eq("user_id", userId);
  await sb.from("sky_recovery_codes").delete().eq("user_id", userId);
}

/* ----------------------------- recovery codes ----------------------------- */

function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code.toUpperCase().replace(/[\s-]/g, "")).digest("hex");
}

export async function regenerateRecoveryCodes(userId: string, count = 10): Promise<string[]> {
  const sb = supabaseAdmin();
  await sb.from("sky_recovery_codes").delete().eq("user_id", userId);
  const codes: string[] = [];
  const rows: { user_id: string; code_hash: string }[] = [];
  for (let i = 0; i < count; i++) {
    const raw = crypto.randomBytes(5).toString("hex").toUpperCase(); // 10 chars
    const pretty = `${raw.slice(0, 5)}-${raw.slice(5)}`;
    codes.push(pretty);
    rows.push({ user_id: userId, code_hash: hashCode(pretty) });
  }
  await sb.from("sky_recovery_codes").insert(rows);
  return codes;
}

/** Consume a recovery code (single use). */
export async function consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("sky_recovery_codes")
    .select("code_id")
    .eq("user_id", userId)
    .eq("code_hash", hashCode(code))
    .is("used_at", null)
    .maybeSingle();
  if (!data) return false;
  const { data: claimed } = await sb
    .from("sky_recovery_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("code_id", data.code_id as string)
    .is("used_at", null)
    .select("code_id")
    .maybeSingle();
  return !!claimed;
}

export async function remainingRecoveryCodes(userId: string): Promise<number> {
  const { count } = await supabaseAdmin()
    .from("sky_recovery_codes")
    .select("code_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("used_at", null);
  return count ?? 0;
}
