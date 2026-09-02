import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { grantsSatisfy, expandGrants } from "./permissions";
import { SYSTEM_ROLES, systemRole, roleKeyFromLegacy } from "./roles";
import type { Permission } from "./permissions";
import type { Principal } from "@/server/identity/types";

/**
 * Effective-permission resolution and enforcement.
 *
 * A principal's grants are the UNION of every role it holds: explicit assignments in
 * sky_role_assignments (human or machine), plus the role implied by its authenticated session for
 * back-compat. Deny by default — no role, no permissions.
 */

export class AuthzError extends Error {
  constructor(public status: number, message: string, public required?: Permission) {
    super(message);
    this.name = "AuthzError";
  }
}

function principalRef(principal: Principal): { type: "user" | "service_key"; id: string } | null {
  if (principal.subjectId.startsWith("service:")) return { type: "service_key", id: principal.subjectId.slice("service:".length) };
  // Sky users are uuids; host-session (Clerk) subjects are not, and simply have no assignments.
  const isUuid = /^[0-9a-f-]{36}$/i.test(principal.subjectId);
  return isUuid ? { type: "user", id: principal.subjectId } : null;
}

async function grantsForRoleKeys(orgId: string, roleKeys: string[]): Promise<Permission[]> {
  const grants: Permission[] = [];
  const custom: string[] = [];
  for (const key of roleKeys) {
    const sys = systemRole(key);
    if (sys) grants.push(...sys.grants);
    else custom.push(key);
  }
  if (custom.length) {
    const { data } = await supabaseAdmin().from("sky_roles").select("key, grants").eq("org_id", orgId).in("key", custom);
    for (const row of data ?? []) grants.push(...((row.grants as Permission[]) ?? []));
  }
  return grants;
}

/** Every permission this principal effectively holds in its tenant. */
export async function effectiveGrants(principal: Principal): Promise<Permission[]> {
  const roleKeys = new Set<string>();

  // Roles implied by the authenticated session (legacy 4-role model) keep existing access working.
  for (const legacy of principal.roles) roleKeys.add(roleKeyFromLegacy(legacy));
  // Roles carried by the credential itself (service key role, SSO-mapped roles).
  for (const key of principal.roleKeys ?? []) roleKeys.add(key);

  // Explicit assignments — the real model going forward.
  const ref = principalRef(principal);
  if (ref) {
    const { data } = await supabaseAdmin()
      .from("sky_role_assignments")
      .select("role_key")
      .eq("org_id", principal.tenantId)
      .eq("principal_type", ref.type)
      .eq("principal_id", ref.id);
    for (const row of data ?? []) roleKeys.add(row.role_key as string);
  }

  return [...new Set(await grantsForRoleKeys(principal.tenantId, [...roleKeys]))];
}

export async function can(principal: Principal, required: Permission): Promise<boolean> {
  return grantsSatisfy(await effectiveGrants(principal), required);
}

/** Enforce a permission, or throw AuthzError(403). */
export async function requirePermission(principal: Principal, required: Permission): Promise<void> {
  if (!(await can(principal, required))) {
    throw new AuthzError(403, `You don't have permission to do this (${required}).`, required);
  }
}

/** Human-readable view of what a principal can do — for the access UI. */
export async function describeAccess(principal: Principal): Promise<{ grants: Permission[]; permissions: Permission[] }> {
  const grants = await effectiveGrants(principal);
  return { grants, permissions: expandGrants(grants) };
}

/* ------------------------------ assignment admin ------------------------------ */

export async function assignRole(input: { orgId: string; principalType: "user" | "service_key"; principalId: string; roleKey: string; grantedBy?: string }): Promise<void> {
  await supabaseAdmin()
    .from("sky_role_assignments")
    .upsert(
      { org_id: input.orgId, principal_type: input.principalType, principal_id: input.principalId, role_key: input.roleKey, granted_by: input.grantedBy ?? null },
      { onConflict: "org_id,principal_type,principal_id,role_key" },
    );
}

export async function revokeRole(input: { orgId: string; principalType: "user" | "service_key"; principalId: string; roleKey: string }): Promise<void> {
  await supabaseAdmin()
    .from("sky_role_assignments")
    .delete()
    .eq("org_id", input.orgId)
    .eq("principal_type", input.principalType)
    .eq("principal_id", input.principalId)
    .eq("role_key", input.roleKey);
}

/** System roles plus this tenant's custom roles — for pickers and the access screen. */
export async function availableRoles(orgId: string) {
  const { data } = await supabaseAdmin().from("sky_roles").select("key, name, description, grants").eq("org_id", orgId);
  const custom = (data ?? []).map((r) => ({ key: r.key as string, name: r.name as string, description: (r.description as string) ?? "", grants: (r.grants as Permission[]) ?? [], system: false }));
  const system = SYSTEM_ROLES.map((r) => ({ key: r.key, name: r.name, description: r.description, grants: r.grants, system: true }));
  return [...system, ...custom];
}
