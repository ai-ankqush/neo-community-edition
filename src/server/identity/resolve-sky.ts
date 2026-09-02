import "server-only";
import { resolveFromSkySession } from "./providers/sky-host";
import { hasRole, IdentityError } from "./types";
import type { Principal } from "./types";
import type { Role } from "@/lib/types/stages";

/**
 * Sky's neutral identity entry point. Kept separate from Gravity's resolvePrincipal: Sky's host is its own
 * Neo-native session (never Clerk). Enterprise SSO (Phase 3) resolves through the same Sky session, so this
 * stays the single door. Agent/service tokens are Gravity's concern, not Sky's human login.
 */
export async function resolveSkyPrincipal(): Promise<Principal> {
  return resolveFromSkySession();
}

export async function requireSkyPrincipal(...allowed: Role[]): Promise<Principal> {
  const principal = await resolveSkyPrincipal();
  if (allowed.length && !hasRole(principal, ...allowed)) {
    throw new IdentityError(403, `Requires role: ${allowed.join(" or ")}`);
  }
  return principal;
}

export type { Principal };
export { IdentityError };
