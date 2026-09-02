import "server-only";
import { resolveFromHostSession } from "./providers/host";
import { resolveFromBuiltinSession } from "./providers/builtin";
import { resolveFromToken } from "./providers/oidc";
import { AUTH_PROVIDER } from "@/ce/auth-provider";
import { verifyServiceKey, KEY_PREFIX } from "@/server/sky/service-keys";
import { hasRole, IdentityError } from "./types";
import type { Principal } from "./types";
import type { Role } from "@/lib/types/stages";

/**
 * The single neutral identity entry point for Gravity. It picks the path by evidence, not by vendor:
 *   - a bearer SERVICE KEY (nsk_…) -> a Neo-issued machine credential, for tenants with no IdP;
 *   - any other bearer token        -> the caller's own IdP (BYO-IdP), verified cryptographically;
 *   - otherwise                     -> the host browser session (Clerk today, behind one adapter).
 * Everything downstream sees only a neutral Principal.
 */
export async function resolvePrincipal(req?: Request): Promise<Principal> {
  const authz = req?.headers.get("authorization") ?? req?.headers.get("Authorization");
  if (authz && authz.toLowerCase().startsWith("bearer ")) {
    const token = authz.slice(7).trim();

    if (token.startsWith(KEY_PREFIX)) {
      const key = await verifyServiceKey(token);
      if (!key) throw new IdentityError(401, "Invalid or revoked service key.");
      // Machines get no legacy role floor — their authority comes entirely from the assigned authz role.
      return { tenantId: key.orgId, subjectId: `service:${key.keyId}`, roles: [], roleKeys: [key.roleKey], idp: "neo-service-key", via: "token" };
    }

    return resolveFromToken(token);
  }
  // Host browser session: Clerk by default; Neo-native Sky when AUTH_PROVIDER=builtin (Community Edition).
  return AUTH_PROVIDER === "builtin" ? resolveFromBuiltinSession() : resolveFromHostSession();
}

/** Resolve + enforce a minimum role, provider-agnostic. */
export async function requireGravityPrincipal(req?: Request, ...allowed: Role[]): Promise<Principal> {
  const principal = await resolvePrincipal(req);
  if (allowed.length && !hasRole(principal, ...allowed)) {
    throw new IdentityError(403, `Requires role: ${allowed.join(" or ")}`);
  }
  return principal;
}

export type { Principal };
export { IdentityError, hasRole };
