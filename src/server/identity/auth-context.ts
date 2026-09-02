import "server-only";
import { auth } from "@clerk/nextjs/server";
import { ensureOrg } from "@/lib/org";
import { readSession } from "@/server/sky/session";
import { supabaseAdmin } from "@/lib/supabase";
import { AUTH_PROVIDER } from "@/ce/auth-provider";

/**
 * Provider-aware auth context for the console — the replacement for the ~90 direct
 * `await auth()` + `ensureOrg(orgId)` call-sites. It returns the same shape whether
 * the host session is Clerk (default) or the Neo-native Sky session (Community Edition,
 * AUTH_PROVIDER=builtin), so pages stop importing Clerk directly.
 *
 * `orgRole` is Clerk-shaped ("org:admin" | "org:member") so existing `=== "org:admin"`
 * checks keep working; `internalOrgId` is always our organizations.id.
 */
export interface AuthContext {
  userId: string | null;
  orgId: string | null;         // host org id (Clerk org id, or the internal id under builtin)
  orgRole: string | null;       // "org:admin" | "org:member" | null
  internalOrgId: string | null; // organizations.id
}

export async function getAuthContext(): Promise<AuthContext> {
  if (AUTH_PROVIDER === "builtin") {
    const s = await readSession();
    if (!s) return { userId: null, orgId: null, orgRole: null, internalOrgId: null };
    const { data } = await supabaseAdmin()
      .from("sky_memberships")
      .select("role")
      .eq("user_id", s.userId)
      .eq("org_id", s.orgId)
      .maybeSingle();
    const orgRole = (data?.role as string) === "org_admin" ? "org:admin" : "org:member";
    // Sky's org_id is already the internal organizations.id.
    return { userId: s.userId, orgId: s.orgId, orgRole, internalOrgId: s.orgId };
  }

  const { userId, orgId, orgRole } = await auth();
  const internalOrgId = orgId ? await ensureOrg(orgId) : null;
  return { userId: userId ?? null, orgId: orgId ?? null, orgRole: orgRole ?? null, internalOrgId };
}
