import "server-only";
import crypto from "crypto";
import { IdentityError } from "./types";

/**
 * Dependency-free JWT verification against a remote JWKS (RS256 / ES256). Node's built-in crypto can build
 * a public key straight from a JWK and verify — so Gravity carries no identity-vendor SDK to validate a
 * bring-your-own-IdP token. Keys are fetched from the issuer's JWKS URL and cached; a kid miss forces one
 * refresh to tolerate key rotation.
 */

type Jwk = { kid?: string; kty: string; alg?: string; use?: string; n?: string; e?: string; crv?: string; x?: string; y?: string };

interface JwksCacheEntry {
  keys: Jwk[];
  fetchedAt: number;
}
const JWKS_CACHE = new Map<string, JwksCacheEntry>();
const JWKS_TTL_MS = 10 * 60 * 1000;

function b64urlToBuffer(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function decodeSegment(seg: string): Record<string, unknown> {
  try {
    return JSON.parse(b64urlToBuffer(seg).toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new IdentityError(401, "Malformed token segment.");
  }
}

async function fetchJwks(jwksUrl: string, force = false): Promise<Jwk[]> {
  const cached = JWKS_CACHE.get(jwksUrl);
  if (!force && cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS) return cached.keys;
  let res: Response;
  try {
    res = await fetch(jwksUrl, { headers: { accept: "application/json" } });
  } catch {
    if (cached) return cached.keys;
    throw new IdentityError(502, "Could not reach the IdP JWKS endpoint.");
  }
  if (!res.ok) {
    if (cached) return cached.keys;
    throw new IdentityError(502, `IdP JWKS endpoint returned ${res.status}.`);
  }
  const body = (await res.json()) as { keys?: Jwk[] };
  const keys = body.keys ?? [];
  JWKS_CACHE.set(jwksUrl, { keys, fetchedAt: Date.now() });
  return keys;
}

function selectKey(keys: Jwk[], kid?: string): Jwk | undefined {
  if (kid) return keys.find((k) => k.kid === kid);
  return keys.length === 1 ? keys[0] : undefined;
}

function verifySignature(alg: string, signingInput: string, jwk: Jwk, signature: Buffer): boolean {
  const keyObject = crypto.createPublicKey({ key: jwk as crypto.JsonWebKey, format: "jwk" });
  const data = Buffer.from(signingInput);
  if (alg === "RS256") return crypto.verify("RSA-SHA256", data, keyObject, signature);
  if (alg === "ES256") return crypto.verify("sha256", data, { key: keyObject, dsaEncoding: "ieee-p1363" }, signature);
  throw new IdentityError(401, `Unsupported token algorithm: ${alg}`);
}

export interface VerifyOptions {
  jwksUrl: string;
  issuer: string;
  audience?: string | null;
  clockToleranceSec?: number;
}

/** Verify a compact JWS and return its claims, or throw IdentityError. */
export async function verifyJwt(token: string, opts: VerifyOptions): Promise<Record<string, unknown>> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new IdentityError(401, "Malformed token.");
  const [headerB64, payloadB64, sigB64] = parts;
  const header = decodeSegment(headerB64);
  const alg = String(header.alg ?? "");
  if (alg !== "RS256" && alg !== "ES256") throw new IdentityError(401, `Unsupported token algorithm: ${alg || "none"}`);

  const signature = b64urlToBuffer(sigB64);
  const signingInput = `${headerB64}.${payloadB64}`;
  const kid = typeof header.kid === "string" ? header.kid : undefined;

  let keys = await fetchJwks(opts.jwksUrl);
  let jwk = selectKey(keys, kid);
  if (!jwk) {
    keys = await fetchJwks(opts.jwksUrl, true); // rotation: force one refresh
    jwk = selectKey(keys, kid);
  }
  if (!jwk) throw new IdentityError(401, "No matching signing key for this token.");

  if (!verifySignature(alg, signingInput, jwk, signature)) throw new IdentityError(401, "Token signature is invalid.");

  const payload = decodeSegment(payloadB64);
  const now = Math.floor(Date.now() / 1000);
  const skew = opts.clockToleranceSec ?? 60;

  if (typeof payload.exp === "number" && payload.exp + skew < now) throw new IdentityError(401, "Token has expired.");
  if (typeof payload.nbf === "number" && payload.nbf - skew > now) throw new IdentityError(401, "Token is not yet valid.");
  if (payload.iss !== opts.issuer) throw new IdentityError(401, "Token issuer mismatch.");
  if (opts.audience) {
    const aud = payload.aud;
    const ok = Array.isArray(aud) ? aud.includes(opts.audience) : aud === opts.audience;
    if (!ok) throw new IdentityError(401, "Token audience mismatch.");
  }
  return payload;
}
