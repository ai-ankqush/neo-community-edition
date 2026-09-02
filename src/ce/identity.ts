import "server-only";
import { resolvePrincipal } from "@/server/identity/resolve";
import { topRole, type Principal } from "@/server/identity/types";
import type { Role } from "@/lib/types/stages";

/**
 * Console identity seam for Community Edition.
 *
 * The dashboard console currently reads identity straight from Clerk (`auth()`,
 * `currentUser()`). To de-Clerk CE, the console needs ONE neutral entry point that
 * returns { user, org, role } regardless of provider. That neutral seam already
 * exists for Gravity (`resolvePrincipal` → `Principal`); this adapts it to the
 * shape the console wants and to CE's coarse role set.
 *
 * PHASE A — additive only. Nothing in production imports this yet, so it changes
 * no behaviour. Later phases move the console's Clerk call-sites onto it (reviewed
 * separately). Backed by the host session (Clerk today), it returns identical data.
 */

/** CE's coarse role set: admin (settings + users + everything) / member (run) / viewer (read). */
export type ConsoleRole = "admin" | "member" | "viewer";

/** Collapse the legacy 4-role model onto CE's coarse three. */
export function coarseRole(p: Principal): ConsoleRole {
  const t = topRole(p); // org_admin | assessor | contributor | viewer
  if (t === "org_admin") return "admin";
  if (t === "viewer") return "viewer";
  return "member"; // assessor, contributor
}

export interface ConsolePrincipal {
  userId: string; // neutral subject id
  orgId: string; // neutral internal organizations.id
  roles: Role[]; // legacy 4-role, kept so existing gate checks keep working
  role: ConsoleRole; // CE coarse role
  idp: string; // provenance only ('clerk' | 'oidc:<issuer>' | …)
  via: "session" | "token";
}

/**
 * Resolve the current console principal through the neutral seam. Backed by the
 * host session today (Clerk), tomorrow by the built-in auth or the customer's SSO —
 * the console never learns which.
 */
export async function consolePrincipal(req?: Request): Promise<ConsolePrincipal> {
  const p = await resolvePrincipal(req);
  return {
    userId: p.subjectId,
    orgId: p.tenantId,
    roles: p.roles,
    role: coarseRole(p),
    idp: p.idp,
    via: p.via,
  };
}

export const isConsoleAdmin = (p: ConsolePrincipal): boolean => p.role === "admin";
