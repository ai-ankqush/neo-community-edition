/** Authenticated encryption for customer credentials at rest (Integration Composer).
 *
 *  Customer read-only tokens must never sit in the database as plaintext. We encrypt
 *  them with AES-256-GCM using a master key held OUTSIDE the database (env / KMS), store
 *  only the ciphertext, and decrypt in memory at verify time. GCM also authenticates the
 *  data, so tampering is detected on decrypt.
 *
 *  Stored format (base64): nonce(12) || ciphertext || authTag(16).
 *  `enc_version` is tracked alongside in the DB so the scheme/key can rotate later. */

import crypto from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

export const ENC_VERSION = 1;

/** The 32-byte master key, from COMPOSER_ENC_KEY (64 hex chars or base64). Throws if absent
 *  or malformed — the app fails CLOSED rather than store/return secrets it can't protect. */
function masterKey(): Buffer {
  const raw = process.env.COMPOSER_ENC_KEY;
  if (!raw) throw new Error("COMPOSER_ENC_KEY is not set — secure credential storage is unavailable.");
  const buf = /^[0-9a-fA-F]{64}$/.test(raw.trim()) ? Buffer.from(raw.trim(), "hex") : Buffer.from(raw.trim(), "base64");
  if (buf.length !== 32) throw new Error("COMPOSER_ENC_KEY must decode to 32 bytes (64 hex chars or base64).");
  return buf;
}

export function hasEncKey(): boolean {
  try { masterKey(); return true; } catch { return false; }
}

export function encryptSecret(obj: Record<string, string>): string {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, masterKey(), iv);
  const ct = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(obj), "utf8")), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ct, tag]).toString("base64");
}

export function decryptSecret(enc: string): Record<string, string> {
  const buf = Buffer.from(enc, "base64");
  if (buf.length < IV_LEN + TAG_LEN) throw new Error("ciphertext too short");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(buf.length - TAG_LEN);
  const ct = buf.subarray(IV_LEN, buf.length - TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, masterKey(), iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  const parsed = JSON.parse(pt.toString("utf8"));
  return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
}
