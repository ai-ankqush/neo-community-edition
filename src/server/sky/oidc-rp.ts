import "server-only";
import crypto from "crypto";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyJwt } from "@/server/identity/jwt";
import { origin, b64url } from "./webauthn";

/**
 * Neo Sky as its own OpenID Connect relying-party — enterprise SSO with ZERO identity vendor. A tenant
 * registers its OIDC provider (sky_sso_connections, keyed by email domain); its people sign in through the
 * customer's own IdP. Authorization-code flow with PKCE + state + nonce; the ID token is verified against
 * the issuer's JWKS with the same code the Gravity agent path uses. Users are JIT-provisioned into the
 * connection's tenant and land in an ordinary Sky session.
 */

const TX_COOKIE = "sky_sso_tx";
const TX_TTL_MS = 10 * 60 * 1000;

export interface SsoConnection {
  connection_id: string;
  org_id: string;
  email_domain: string;
  display_name: string;
  issuer: string;
  client_id: string | null;
  client_secret: string | null;
  authorization_endpoint: string | null;
  token_endpoint: string | null;
  jwks_url: string | null;
  scopes: string;
  subject_claim: string;
  email_claim: string;
  enabled: boolean;
  verified_at: string | null;
  groups_claim: string | null;
  default_role_key: string;
}

function secret(): Buffer {
  const s = process.env.SKY_SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SKY_SESSION_SECRET is not set — SSO fails closed.");
  return Buffer.from(s);
}

export function redirectUri(): string {
  return `${origin()}/api/sky/auth/sso/callback`;
}

export async function getConnectionByDomain(domain: string): Promise<SsoConnection | null> {
  const { data } = await supabaseAdmin().from("sky_sso_connections").select("*").ilike("email_domain", domain.trim().toLowerCase()).maybeSingle();
  return (data as SsoConnection | null) ?? null;
}

/** Resolve the provider's endpoints, using stored values or the issuer's discovery document. */
async function resolveEndpoints(conn: SsoConnection): Promise<{ authorization_endpoint: string; token_endpoint: string; jwks_url: string }> {
  if (conn.authorization_endpoint && conn.token_endpoint && conn.jwks_url) {
    return { authorization_endpoint: conn.authorization_endpoint, token_endpoint: conn.token_endpoint, jwks_url: conn.jwks_url };
  }
  const wellKnown = `${conn.issuer.replace(/\/$/, "")}/.well-known/openid-configuration`;
  const res = await fetch(wellKnown, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`OIDC discovery failed for ${conn.issuer} (${res.status}).`);
  const doc = (await res.json()) as { authorization_endpoint?: string; token_endpoint?: string; jwks_uri?: string };
  if (!doc.authorization_endpoint || !doc.token_endpoint || !doc.jwks_uri) throw new Error("OIDC discovery document is incomplete.");
  return { authorization_endpoint: doc.authorization_endpoint, token_endpoint: doc.token_endpoint, jwks_url: doc.jwks_uri };
}

/** Build the IdP authorization URL, remembering the PKCE verifier / state / nonce in a signed cookie. */
export async function beginSso(conn: SsoConnection): Promise<string> {
  if (!conn.enabled) throw new Error("This SSO connection is disabled.");
  if (!conn.verified_at) throw new Error("This SSO domain has not been verified.");
  if (!conn.client_id) throw new Error("This SSO connection is missing a client id.");
  const { authorization_endpoint, token_endpoint, jwks_url } = await resolveEndpoints(conn);

  const state = b64url(crypto.randomBytes(16));
  const nonce = b64url(crypto.randomBytes(16));
  const codeVerifier = b64url(crypto.randomBytes(32));
  const codeChallenge = b64url(crypto.createHash("sha256").update(codeVerifier).digest());
  const exp = Date.now() + TX_TTL_MS;

  // The endpoints resolved now are stashed so the callback doesn't rediscover.
  const payload = [conn.connection_id, state, codeVerifier, nonce, token_endpoint, jwks_url, String(exp)].map((s) => encodeURIComponent(s)).join("|");
  const mac = crypto.createHmac("sha256", secret()).update(payload).digest("hex");
  const jar = await cookies();
  jar.set(TX_COOKIE, `${payload}.${mac}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600 });

  const url = new URL(authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", conn.client_id);
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("scope", conn.scopes || "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

interface Tx {
  connectionId: string;
  state: string;
  codeVerifier: string;
  nonce: string;
  tokenEndpoint: string;
  jwksUrl: string;
}

async function takeTx(): Promise<Tx | null> {
  const jar = await cookies();
  const raw = jar.get(TX_COOKIE)?.value;
  if (!raw) return null;
  jar.delete(TX_COOKIE);
  const dot = raw.lastIndexOf(".");
  if (dot < 0) return null;
  const payload = raw.slice(0, dot);
  const mac = raw.slice(dot + 1);
  const expected = crypto.createHmac("sha256", secret()).update(payload).digest("hex");
  const a = Buffer.from(mac), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const parts = payload.split("|").map((s) => decodeURIComponent(s));
  const [connectionId, state, codeVerifier, nonce, tokenEndpoint, jwksUrl, expStr] = parts;
  if (Number(expStr) < Date.now()) return null;
  return { connectionId, state, codeVerifier, nonce, tokenEndpoint, jwksUrl };
}

export interface SsoResult {
  ok: boolean;
  userId?: string;
  orgId?: string;
  reason?: string;
}

/** Handle the IdP redirect: validate state, exchange the code, verify the ID token, provision the user. */
export async function completeSso(code: string, state: string): Promise<SsoResult> {
  const tx = await takeTx();
  if (!tx) return { ok: false, reason: "no_transaction" };
  if (tx.state !== state) return { ok: false, reason: "state_mismatch" };

  const conn = await getConnectionBy(tx.connectionId);
  if (!conn || !conn.enabled || !conn.verified_at || !conn.client_id) return { ok: false, reason: "connection" };

  // Exchange the authorization code (PKCE).
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    client_id: conn.client_id,
    code_verifier: tx.codeVerifier,
  });
  if (conn.client_secret) body.set("client_secret", conn.client_secret);

  const tokenRes = await fetch(tx.tokenEndpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body });
  if (!tokenRes.ok) return { ok: false, reason: "token_exchange" };
  const tokens = (await tokenRes.json()) as { id_token?: string };
  if (!tokens.id_token) return { ok: false, reason: "no_id_token" };

  // Verify the ID token against the issuer's JWKS, audience = client_id, then the nonce.
  let claims: Record<string, unknown>;
  try {
    claims = await verifyJwt(tokens.id_token, { jwksUrl: tx.jwksUrl, issuer: conn.issuer, audience: conn.client_id });
  } catch {
    return { ok: false, reason: "id_token_invalid" };
  }
  if (claims.nonce !== tx.nonce) return { ok: false, reason: "nonce_mismatch" };

  const email = String(claims[conn.email_claim] ?? claims.email ?? "").trim();
  if (!email) return { ok: false, reason: "no_email" };

  const userId = await provisionUser(email, conn.org_id, String(claims.name ?? ""));
  await applyGroupRoles(conn, userId, claims);
  return { ok: true, userId, orgId: conn.org_id };
}

async function getConnectionBy(connectionId: string): Promise<SsoConnection | null> {
  const { data } = await supabaseAdmin().from("sky_sso_connections").select("*").eq("connection_id", connectionId).maybeSingle();
  return (data as SsoConnection | null) ?? null;
}

/**
 * Turn the IdP's group claim into Neo roles — this is what makes SSO actually GRANT access rather than
 * merely prove identity. Unmatched users fall back to the connection's default role (least privilege).
 */
async function applyGroupRoles(conn: SsoConnection, userId: string, claims: Record<string, unknown>): Promise<void> {
  const sb = supabaseAdmin();
  let matched: string[] = [];

  if (conn.groups_claim) {
    const raw = claims[conn.groups_claim];
    const groups = (Array.isArray(raw) ? raw.map(String) : typeof raw === "string" ? raw.split(/[\s,]+/) : []).map((g) => g.trim().toLowerCase()).filter(Boolean);
    if (groups.length) {
      const { data } = await sb.from("sky_sso_role_mappings").select("claim_value, role_key").eq("connection_id", conn.connection_id);
      matched = (data ?? []).filter((m) => groups.includes(String(m.claim_value).toLowerCase())).map((m) => m.role_key as string);
    }
  }

  const roleKeys = matched.length ? [...new Set(matched)] : [conn.default_role_key || "viewer"];
  for (const roleKey of roleKeys) {
    await sb
      .from("sky_role_assignments")
      .upsert({ org_id: conn.org_id, principal_type: "user", principal_id: userId, role_key: roleKey }, { onConflict: "org_id,principal_type,principal_id,role_key" });
  }
}

/** Find-or-create the user by email and ensure membership in the SSO tenant (JIT provisioning). */
async function provisionUser(email: string, orgId: string, name: string): Promise<string> {
  const sb = supabaseAdmin();
  const { data: existing } = await sb.from("sky_users").select("user_id").ilike("email", email).maybeSingle();

  let userId: string;
  if (existing) {
    userId = existing.user_id as string;
    await sb.from("sky_users").update({ email_verified: true }).eq("user_id", userId).eq("email_verified", false);
  } else {
    const { data: created, error } = await sb.from("sky_users").insert({ email, display_name: name || null, email_verified: true }).select("user_id").single();
    if (error || !created) throw error ?? new Error("Could not provision user.");
    userId = created.user_id as string;
  }

  // Ensure membership in the connection's tenant (idempotent).
  const { data: member } = await sb.from("sky_memberships").select("user_id").eq("org_id", orgId).eq("user_id", userId).maybeSingle();
  if (!member) await sb.from("sky_memberships").insert({ org_id: orgId, user_id: userId, role: "contributor" });
  return userId;
}
