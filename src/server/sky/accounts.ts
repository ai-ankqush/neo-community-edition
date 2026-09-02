import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { AUTH_PROVIDER } from "@/ce/auth-provider";
import { hashPassword } from "./password";

/**
 * Sky account provisioning — Neo-native, no Clerk. A signup creates a neutral organization (the tenant),
 * a Sky user, and an owner membership. Optional password credential. Enterprise SSO (Phase 3) JIT-provisions
 * through the same helpers.
 */

export interface SkyUser {
  userId: string;
  email: string;
  emailVerified: boolean;
  displayName: string | null;
}

export async function findUserByEmail(email: string): Promise<SkyUser | null> {
  const { data } = await supabaseAdmin()
    .from("sky_users")
    .select("user_id, email, email_verified, display_name")
    .ilike("email", email.trim())
    .maybeSingle();
  if (!data) return null;
  return { userId: data.user_id as string, email: data.email as string, emailVerified: !!data.email_verified, displayName: (data.display_name as string) ?? null };
}

/** The org the user belongs to (first/oldest membership) — the default active org at login. */
export async function primaryOrgForUser(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin()
    .from("sky_memberships")
    .select("org_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data?.org_id as string) ?? null;
}

export interface OrgMembership {
  orgId: string;
  name: string;
  role: string;
}

/** Every org the user is a member of — powers the org switcher. */
export async function orgsForUser(userId: string): Promise<OrgMembership[]> {
  const sb = supabaseAdmin();
  const { data: mems } = await sb.from("sky_memberships").select("org_id, role").eq("user_id", userId);
  const rows = mems ?? [];
  const ids = rows.map((m) => m.org_id as string);
  if (!ids.length) return [];
  const { data: orgs } = await sb.from("organizations").select("id, name").in("id", ids);
  const nameById = new Map((orgs ?? []).map((o) => [o.id as string, (o.name as string) ?? "Organization"]));
  return rows
    .map((m) => ({ orgId: m.org_id as string, name: nameById.get(m.org_id as string) ?? "Organization", role: (m.role as string) ?? "member" }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Whether the user has a membership in the given org (guards org switching). */
export async function isMember(userId: string, orgId: string): Promise<boolean> {
  const { data } = await supabaseAdmin()
    .from("sky_memberships")
    .select("user_id")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .maybeSingle();
  return !!data;
}

/** Create a NEW org owned by an existing user (for "add another organization"). Returns the org id. */
export async function createOrgForUser(userId: string, orgName: string): Promise<string> {
  const sb = supabaseAdmin();
  const ce = AUTH_PROVIDER === "builtin";
  const name = (orgName || "Organization").trim().slice(0, 120) || "Organization";
  const { data: org, error } = await sb
    .from("organizations")
    .insert({ name, plan: ce ? "community" : "trial", trial_ends_at: ce ? null : new Date(Date.now() + 14 * 86400_000).toISOString() })
    .select("id")
    .single();
  if (error || !org) throw error ?? new Error("Could not create organization.");
  const orgId = org.id as string;
  const { error: memErr } = await sb.from("sky_memberships").insert({ org_id: orgId, user_id: userId, role: "org_admin" });
  if (memErr) throw memErr;
  return orgId;
}

export async function getPasswordHash(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin()
    .from("sky_credentials")
    .select("data")
    .eq("user_id", userId)
    .eq("method", "password")
    .maybeSingle();
  const hash = (data?.data as { hash?: string } | undefined)?.hash;
  return hash ?? null;
}

/** Set or replace the user's password credential (used by reset). */
export async function setPasswordCredential(userId: string, password: string): Promise<void> {
  const sb = supabaseAdmin();
  const hash = await hashPassword(password);
  const { data: existing } = await sb.from("sky_credentials").select("credential_id").eq("user_id", userId).eq("method", "password").maybeSingle();
  if (existing) {
    await sb.from("sky_credentials").update({ data: { alg: "scrypt", hash } }).eq("credential_id", existing.credential_id as string);
  } else {
    await sb.from("sky_credentials").insert({ user_id: userId, method: "password", data: { alg: "scrypt", hash } });
  }
}

export interface CreateAccountInput {
  email: string;
  displayName?: string;
  orgName?: string;
  password?: string;
  emailVerified?: boolean;
}

export interface CreateAccountResult {
  userId: string;
  orgId: string;
}

/** Create org + user + owner membership (+ optional password). Throws if the email already exists. */
export async function createAccount(input: CreateAccountInput): Promise<CreateAccountResult> {
  const email = input.email.trim();
  const existing = await findUserByEmail(email);
  if (existing) throw new Error("An account already exists for that email.");

  const sb = supabaseAdmin();

  // Neutral tenant — no Clerk id.
  const trialEndsAt = new Date(Date.now() + 14 * 86400_000).toISOString();
  const orgName = (input.orgName ?? input.displayName ?? email.split("@")[0]).slice(0, 120);
  // Community Edition orgs run on the unlimited, no-trial `community` plan (BYO model key).
  const ce = AUTH_PROVIDER === "builtin";
  const { data: org, error: orgErr } = await sb
    .from("organizations")
    .insert({ name: orgName, plan: ce ? "community" : "trial", trial_ends_at: ce ? null : trialEndsAt })
    .select("id")
    .single();
  if (orgErr || !org) throw orgErr ?? new Error("Could not create organization.");

  const { data: user, error: userErr } = await sb
    .from("sky_users")
    .insert({ email, display_name: input.displayName ?? null, email_verified: input.emailVerified ?? false })
    .select("user_id")
    .single();
  if (userErr || !user) throw userErr ?? new Error("Could not create user.");

  const orgId = org.id as string;
  const userId = user.user_id as string;

  // First user of a fresh org is its owner.
  const { error: memErr } = await sb.from("sky_memberships").insert({ org_id: orgId, user_id: userId, role: "org_admin" });
  if (memErr) throw memErr;

  if (input.password) {
    const hash = await hashPassword(input.password);
    const { error: credErr } = await sb.from("sky_credentials").insert({ user_id: userId, method: "password", data: { alg: "scrypt", hash } });
    if (credErr) throw credErr;
  }

  return { userId, orgId };
}
