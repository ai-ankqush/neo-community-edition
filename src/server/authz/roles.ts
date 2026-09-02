import type { Permission } from "./permissions";
import type { Role as LegacyRole } from "@/lib/types/stages";

/**
 * Roles are named bundles of permissions. System roles ship with Neo; tenants may define their own
 * (sky_roles) without code changes, which is what keeps this flexible as capabilities are added.
 *
 * Grants use wildcards deliberately: a role written as `overlay:*` automatically picks up new overlay
 * permissions when that capability grows, instead of silently under-granting.
 */

export interface RoleDef {
  key: string;
  name: string;
  description: string;
  grants: Permission[];
  /** Machine-oriented roles are offered when issuing service keys. */
  forMachines?: boolean;
}

export const SYSTEM_ROLES: RoleDef[] = [
  {
    key: "owner",
    name: "Owner",
    description: "Full authority over the organization, including identity and billing.",
    grants: ["*"],
  },
  {
    key: "admin",
    name: "Administrator",
    description: "Runs the organization day to day — members, identity, integrations, and all content.",
    grants: ["org:*", "members:*", "identity:*", "integration:*", "usecase:*", "overlay:*", "control:*", "evidence:*", "gravity:*", "report:*"],
  },
  {
    key: "author",
    name: "Author",
    description: "Builds the tenant's world: use cases, controls, and overlay drafts. Cannot change identity or members.",
    grants: ["org:read", "members:read", "usecase:*", "overlay:read", "overlay:author", "control:read", "control:write", "evidence:*", "integration:read", "gravity:read", "report:*"],
  },
  {
    key: "operator",
    name: "Operator",
    description: "Runs governed actions and verifications. The natural role for agents and services.",
    grants: ["org:read", "usecase:read", "control:read", "control:verify", "evidence:read", "evidence:write", "gravity:read", "gravity:act", "gravity:verify", "integration:read"],
    forMachines: true,
  },
  {
    key: "auditor",
    name: "Auditor",
    description: "Read-only across everything, plus the ability to export evidence and reports.",
    grants: ["org:read", "members:read", "identity:read", "usecase:read", "overlay:read", "control:read", "evidence:read", "gravity:read", "integration:read", "report:*"],
  },
  {
    key: "viewer",
    name: "Viewer",
    description: "Read-only access to use cases, controls, and reports.",
    grants: ["org:read", "usecase:read", "control:read", "report:read"],
  },
];

export const SYSTEM_ROLE_KEYS = SYSTEM_ROLES.map((r) => r.key);

export function systemRole(key: string): RoleDef | undefined {
  return SYSTEM_ROLES.find((r) => r.key === key);
}

/**
 * Back-compat: the platform's original four roles map onto system roles, so existing sessions,
 * memberships, and service keys keep working while the richer model takes over.
 */
export const LEGACY_ROLE_MAP: Record<LegacyRole, string> = {
  org_admin: "admin",
  assessor: "author",
  contributor: "author",
  viewer: "viewer",
};

export function roleKeyFromLegacy(role: LegacyRole | undefined): string {
  return (role && LEGACY_ROLE_MAP[role]) || "viewer";
}
