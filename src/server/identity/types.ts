import type { Role } from "@/lib/types/stages";

/**
 * The neutral principal Gravity runs on. It carries NO provider-specific identity — just a neutral
 * tenant id (our organizations.id), a neutral subject id, roles, and provenance. Whether the caller
 * authenticated through the host session (Clerk today) or presented a bearer token from their own IdP,
 * Gravity sees the same shape and never imports an identity vendor.
 */
export interface Principal {
  tenantId: string; // neutral internal organizations.id
  subjectId: string; // neutral subject identifier
  roles: Role[]; // legacy 4-role model, kept for back-compat
  /** AuthZ role keys carried by the credential itself (e.g. a service key's role, SSO-mapped roles). */
  roleKeys?: string[];
  idp: string; // 'clerk' | 'oidc:<issuer>' — provenance only, not an authority
  via: "session" | "token";
}

export class IdentityError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "IdentityError";
  }
}

/** Highest-authority role wins for gate checks. */
const ROLE_RANK: Record<Role, number> = { org_admin: 3, assessor: 2, contributor: 1, viewer: 0 };

export function hasRole(principal: Principal, ...allowed: Role[]): boolean {
  return principal.roles.some((r) => allowed.includes(r));
}

export function topRole(principal: Principal): Role {
  return principal.roles.reduce<Role>((best, r) => (ROLE_RANK[r] > ROLE_RANK[best] ? r : best), "viewer");
}
