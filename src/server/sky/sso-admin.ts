import "server-only";
import crypto from "crypto";
import dns from "dns/promises";
import { supabaseAdmin } from "@/lib/supabase";
import { origin } from "./webauthn";

/**
 * Self-serve enterprise SSO administration for a Sky tenant.
 *
 * Domain ownership is enforced. Home-realm discovery means whoever claims an email domain decides where
 * that domain's people are sent to authenticate — so a connection stays dormant until the tenant proves
 * control of the domain with a DNS TXT record at _neo-verify.<domain>. Only verified + enabled connections
 * are ever advertised on the login page or usable to start SSO.
 */

export const VERIFY_HOST_PREFIX = "_neo-verify";

export interface ConnectionView {
  connectionId: string;
  emailDomain: string;
  displayName: string;
  issuer: string;
  clientId: string | null;
  hasClientSecret: boolean;
  enabled: boolean;
  verified: boolean;
  verificationToken: string;
  verificationRecord: { host: string; type: "TXT"; value: string };
  redirectUri: string;
}

function view(row: Record<string, unknown>): ConnectionView {
  const domain = String(row.email_domain);
  const token = String(row.verification_token ?? "");
  return {
    connectionId: String(row.connection_id),
    emailDomain: domain,
    displayName: String(row.display_name),
    issuer: String(row.issuer),
    clientId: (row.client_id as string) ?? null,
    hasClientSecret: !!row.client_secret,
    enabled: !!row.enabled,
    verified: !!row.verified_at,
    verificationToken: token,
    verificationRecord: { host: `${VERIFY_HOST_PREFIX}.${domain}`, type: "TXT", value: token },
    redirectUri: `${origin()}/api/sky/auth/sso/callback`,
  };
}

export async function getConnection(orgId: string): Promise<ConnectionView | null> {
  const { data } = await supabaseAdmin().from("sky_sso_connections").select("*").eq("org_id", orgId).maybeSingle();
  return data ? view(data) : null;
}

export interface UpsertInput {
  emailDomain: string;
  displayName: string;
  issuer: string;
  clientId?: string;
  clientSecret?: string; // write-only; omit to leave unchanged
  enabled?: boolean;
}

/** Create or update the tenant's connection. Changing the domain resets verification. */
export async function upsertConnection(orgId: string, input: UpsertInput): Promise<ConnectionView> {
  const sb = supabaseAdmin();
  const domain = input.emailDomain.trim().toLowerCase().replace(/^@/, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) throw new Error("Enter a valid email domain, e.g. acme.com");
  if (!/^https:\/\//.test(input.issuer.trim())) throw new Error("Issuer must be an https URL.");

  const existing = await getConnection(orgId);

  // A domain may only be claimed by one tenant.
  const { data: clash } = await sb.from("sky_sso_connections").select("org_id").ilike("email_domain", domain).maybeSingle();
  if (clash && clash.org_id !== orgId) throw new Error("That domain is already claimed by another organization.");

  const domainChanged = !existing || existing.emailDomain !== domain;
  const patch: Record<string, unknown> = {
    org_id: orgId,
    email_domain: domain,
    display_name: input.displayName.trim().slice(0, 80) || domain,
    issuer: input.issuer.trim().replace(/\/$/, ""),
    client_id: input.clientId?.trim() || null,
    enabled: input.enabled ?? existing?.enabled ?? false,
    updated_at: new Date().toISOString(),
  };
  if (input.clientSecret) patch.client_secret = input.clientSecret.trim();
  if (domainChanged) {
    patch.verification_token = `neo-verify-${crypto.randomBytes(16).toString("hex")}`;
    patch.verified_at = null;
    patch.enabled = false; // can't be live on an unverified domain
  }

  if (existing) {
    const { error } = await sb.from("sky_sso_connections").update(patch).eq("connection_id", existing.connectionId).eq("org_id", orgId);
    if (error) throw error;
  } else {
    const { error } = await sb.from("sky_sso_connections").insert(patch);
    if (error) throw error;
  }
  const saved = await getConnection(orgId);
  if (!saved) throw new Error("Could not save the connection.");
  return saved;
}

export async function deleteConnection(orgId: string): Promise<void> {
  await supabaseAdmin().from("sky_sso_connections").delete().eq("org_id", orgId);
}

/** Look for the _neo-verify TXT record and mark the domain verified when the token matches. */
export async function verifyDomain(orgId: string): Promise<{ verified: boolean; found: string[]; expected: string }> {
  const conn = await getConnection(orgId);
  if (!conn) throw new Error("No SSO connection to verify.");
  const host = `${VERIFY_HOST_PREFIX}.${conn.emailDomain}`;

  let found: string[] = [];
  try {
    const records = await dns.resolveTxt(host);
    found = records.map((chunks) => chunks.join("").trim());
  } catch {
    found = [];
  }

  const verified = found.includes(conn.verificationToken);
  if (verified) {
    await supabaseAdmin().from("sky_sso_connections").update({ verified_at: new Date().toISOString() }).eq("connection_id", conn.connectionId).eq("org_id", orgId);
  }
  return { verified, found, expected: conn.verificationToken };
}

/** Probe the issuer's discovery document so the tenant gets a clear yes/no before going live. */
export async function probeIssuer(issuer: string): Promise<{ ok: boolean; detail: string }> {
  const url = `${issuer.trim().replace(/\/$/, "")}/.well-known/openid-configuration`;
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) return { ok: false, detail: `Discovery returned ${res.status} from ${url}` };
    const doc = (await res.json()) as { authorization_endpoint?: string; token_endpoint?: string; jwks_uri?: string };
    if (!doc.authorization_endpoint || !doc.token_endpoint || !doc.jwks_uri) {
      return { ok: false, detail: "Discovery document is missing authorization/token/jwks endpoints." };
    }
    return { ok: true, detail: "Discovery succeeded — endpoints and signing keys found." };
  } catch {
    return { ok: false, detail: `Could not reach ${url}` };
  }
}
