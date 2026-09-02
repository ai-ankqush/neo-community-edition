import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyJwt } from "../jwt";
import { resolveTenantByBinding } from "../tenant-map";
import { IdentityError } from "../types";
import type { Principal } from "../types";
import type { Role } from "@/lib/types/stages";

/**
 * Bring-your-own-IdP token adapter. A customer registers its own OIDC issuer (gravity_idp_configs); its
 * agents/services present bearer tokens signed by that issuer. Gravity verifies the token against the
 * issuer's JWKS and maps the claims to a neutral Principal — no vendor SDK, no Clerk. Sky (or any IdP)
 * owns authn/z; Gravity only trusts a verified principal and gives it the isolation it needs.
 */

interface IdpConfig {
  issuer: string;
  org_id: string;
  jwks_url: string;
  audience: string | null;
  tenant_claim: string | null;
  subject_claim: string;
  roles_claim: string | null;
  role_map: Record<string, string>;
  default_role: string;
  enabled: boolean;
}

const VALID_ROLES: ReadonlySet<string> = new Set(["org_admin", "assessor", "contributor", "viewer"]);

function unverifiedIssuer(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    return typeof payload.iss === "string" ? payload.iss : null;
  } catch {
    return null;
  }
}

function mapRoles(cfg: IdpConfig, claims: Record<string, unknown>): Role[] {
  const fallback = (VALID_ROLES.has(cfg.default_role) ? cfg.default_role : "viewer") as Role;
  if (!cfg.roles_claim) return [fallback];
  const raw = claims[cfg.roles_claim];
  const list = Array.isArray(raw) ? raw.map(String) : typeof raw === "string" ? raw.split(/[\s,]+/) : [];
  const mapped = list
    .map((r) => cfg.role_map[r])
    .filter((r): r is string => typeof r === "string" && VALID_ROLES.has(r)) as Role[];
  return mapped.length ? Array.from(new Set(mapped)) : [fallback];
}

export async function resolveFromToken(token: string): Promise<Principal> {
  const iss = unverifiedIssuer(token);
  if (!iss) throw new IdentityError(401, "Bearer token carries no issuer.");

  const { data } = await supabaseAdmin()
    .from("gravity_idp_configs")
    .select("issuer, org_id, jwks_url, audience, tenant_claim, subject_claim, roles_claim, role_map, default_role, enabled")
    .eq("issuer", iss)
    .maybeSingle();

  const cfg = data as IdpConfig | null;
  if (!cfg) throw new IdentityError(401, `No Gravity IdP is registered for issuer "${iss}".`);
  if (!cfg.enabled) throw new IdentityError(403, "This IdP registration is disabled.");

  // Verified — signature, exp/nbf, iss, aud all checked here.
  const claims = await verifyJwt(token, { jwksUrl: cfg.jwks_url, issuer: cfg.issuer, audience: cfg.audience });

  const subject = claims[cfg.subject_claim];
  if (typeof subject !== "string" || !subject) throw new IdentityError(401, `Token is missing subject claim "${cfg.subject_claim}".`);

  // Tenant: a multi-tenant IdP can carry a tenant handle mapped via gravity_tenant_identities; otherwise
  // the issuer belongs to exactly one registered org.
  let tenantId = cfg.org_id;
  if (cfg.tenant_claim) {
    const handle = claims[cfg.tenant_claim];
    if (typeof handle !== "string" || !handle) throw new IdentityError(401, `Token is missing tenant claim "${cfg.tenant_claim}".`);
    const resolved = await resolveTenantByBinding("oidc", handle);
    if (!resolved) throw new IdentityError(403, `No Gravity tenant is bound to "${handle}".`);
    tenantId = resolved;
  }

  return {
    tenantId,
    subjectId: subject,
    roles: mapRoles(cfg, claims),
    idp: `oidc:${cfg.issuer}`,
    via: "token",
  };
}
