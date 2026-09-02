import "server-only";
import crypto from "crypto";

/**
 * Dependency-free password hashing (scrypt, from Node's built-in crypto). No bcrypt/argon2 package, no
 * vendor. Format is self-describing so parameters can evolve without a migration:
 *   scrypt$<N>$<r>$<p>$<saltB64>$<hashB64>
 */
const N = 16384; // CPU/memory cost
const R = 8;
const P = 1;
const KEYLEN = 64;

function scrypt(password: string, salt: Buffer, N_: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // maxmem must accommodate 128 * N * r bytes.
    crypto.scrypt(password.normalize("NFKC"), salt, KEYLEN, { N: N_, r, p, maxmem: 256 * N_ * r }, (err, dk) => {
      if (err) reject(err);
      else resolve(dk as Buffer);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 10) throw new Error("Password must be at least 10 characters.");
  const salt = crypto.randomBytes(16);
  const dk = await scrypt(password, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${dk.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nStr, rStr, pStr, saltB64, hashB64] = parts;
  const n = Number(nStr), r = Number(rStr), p = Number(pStr);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  const expected = Buffer.from(hashB64, "base64");
  let actual: Buffer;
  try {
    actual = await scrypt(password, Buffer.from(saltB64, "base64"), n, r, p);
  } catch {
    return false;
  }
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}
