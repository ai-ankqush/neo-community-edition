import "server-only";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { SYSTEM_ROLE_KEYS } from "@/server/authz/roles";

/**
 * Service keys — machine credentials for tenants whose agents have NO corporate IdP. This is the no-IdP
 * fallback that sits beside bring-your-own-IdP: Neo issues a scoped, revocable key that resolves to the
 * same neutral Principal as any other caller.
 *
 * The key is shown exactly once. Only its SHA-256 is stored, so a database leak yields no usable credential.
 */

export const KEY_PREFIX = "nsk_";
const VALID_ROLE_KEYS: ReadonlySet<string> = new Set(SYSTEM_ROLE_KEYS);

function hash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export interface IssuedKey {
  keyId: string;
  /** Full secret — returned once, never retrievable again. */
  token: string;
  prefix: string;
}

export async function issueServiceKey(input: { orgId: string; name: string; roleKey?: string; createdBy?: string }): Promise<IssuedKey> {
  const token = `${KEY_PREFIX}${crypto.randomBytes(30).toString("base64url")}`;
  const prefix = token.slice(0, 12);
  const role = input.roleKey && VALID_ROLE_KEYS.has(input.roleKey) ? input.roleKey : "operator";

  const { data, error } = await supabaseAdmin()
    .from("sky_service_keys")
    .insert({ org_id: input.orgId, name: input.name.slice(0, 80), key_prefix: prefix, key_hash: hash(token), role, created_by: input.createdBy ?? null })
    .select("key_id")
    .single();
  if (error || !data) throw error ?? new Error("Could not create the service key.");

  return { keyId: data.key_id as string, token, prefix };
}

export interface ServiceKeyPrincipalParts {
  orgId: string;
  keyId: string;
  /** AuthZ role key this credential acts as (e.g. 'operator'). */
  roleKey: string;
}

/** Verify a presented key. Returns null if unknown or revoked. */
export async function verifyServiceKey(token: string): Promise<ServiceKeyPrincipalParts | null> {
  if (!token.startsWith(KEY_PREFIX)) return null;
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("sky_service_keys")
    .select("key_id, org_id, role, revoked_at")
    .eq("key_hash", hash(token))
    .maybeSingle();
  if (!data || data.revoked_at) return null;

  await sb.from("sky_service_keys").update({ last_used_at: new Date().toISOString() }).eq("key_id", data.key_id as string);
  return { orgId: data.org_id as string, keyId: data.key_id as string, roleKey: (data.role as string) || "operator" };
}

export async function listServiceKeys(orgId: string) {
  const { data } = await supabaseAdmin()
    .from("sky_service_keys")
    .select("key_id, name, key_prefix, role, created_at, last_used_at, revoked_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function revokeServiceKey(orgId: string, keyId: string): Promise<void> {
  await supabaseAdmin()
    .from("sky_service_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("key_id", keyId)
    .eq("org_id", orgId)
    .is("revoked_at", null);
}
