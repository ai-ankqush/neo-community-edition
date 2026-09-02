import { supabaseAdmin } from "@/lib/supabase";
import { getAuthContext } from "@/server/identity/auth-context";
import type { Role } from "@/lib/types/stages";

/**
 * RBAC: Clerk provides auth + the admin/member distinction (free tier of
 * org roles). Platform roles (assessor/contributor/viewer) live in OUR
 * memberships table - audit-logged, no per-role vendor fees.
 *
 *   Clerk org:admin  -> org_admin (always)
 *   Clerk org:member -> memberships.role, defaulting to viewer
 */

export interface Session {
  userId: string;
  orgId: string;        // clerk org id
  internalOrgId: string; // our organizations.id
  role: Role;
}

export async function requireSession(): Promise<Session> {
  const { userId, orgId, orgRole, internalOrgId } = await getAuthContext();
  if (!userId) throw new ApiError(401, "Not authenticated");
  if (!internalOrgId) throw new ApiError(403, "No organization selected");
  const hostOrgId = orgId ?? internalOrgId;

  // Platform role comes from OUR memberships table first (the host IdP only
  // carries the org:admin distinction, so it can't express contributor/assessor/
  // viewer). An explicit membership row always wins; otherwise an org admin is
  // the bootstrap owner (org_admin), and everyone else is viewer.
  const { data } = await supabaseAdmin()
    .from("memberships")
    .select("role")
    .eq("org_id", internalOrgId)
    .eq("user_id", userId)
    .maybeSingle();

  if (data?.role) return { userId, orgId: hostOrgId, internalOrgId, role: data.role as Role };
  if (orgRole === "org:admin") return { userId, orgId: hostOrgId, internalOrgId, role: "org_admin" };
  return { userId, orgId: hostOrgId, internalOrgId, role: "viewer" };
}

export async function requireRole(...allowed: Role[]): Promise<Session> {
  const session = await requireSession();
  if (!allowed.includes(session.role)) {
    throw new ApiError(403, `Requires role: ${allowed.join(" or ")}`);
  }
  return session;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
