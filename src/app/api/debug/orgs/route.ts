import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { getAuthContext } from "@/server/identity/auth-context";
import { AUTH_PROVIDER } from "@/ce/auth-provider";
import { isSuperAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * GET /api/debug/orgs — super-admin diagnostic. Shows exactly what the APP sees:
 *   - the active org on the current session,
 *   - every Clerk organization membership for this user (what the OrganizationSwitcher lists from),
 *   - the rows in our own organizations table.
 * If a Clerk org you expect is missing from `clerkMemberships`, the app genuinely isn't seeing it for this
 * session/instance — which is a Clerk session/instance issue, not our code. Delete this route once resolved.
 */
export async function GET() {
  const { userId, orgId } = await getAuthContext();
  if (!isSuperAdmin(userId)) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Community Edition has no Clerk — report Sky memberships instead of Clerk orgs.
  let clerkMemberships: unknown = null;
  if (AUTH_PROVIDER === "builtin") {
    const { data } = await supabaseAdmin()
      .from("sky_memberships")
      .select("org_id, role")
      .eq("user_id", userId!);
    clerkMemberships = { note: "built-in auth (no Clerk)", skyMemberships: data ?? [] };
  } else {
    try {
      const client = await clerkClient();
      const list = await client.users.getOrganizationMembershipList({ userId: userId! });
      clerkMemberships = list.data.map((m) => ({
        orgId: m.organization.id,
        orgName: m.organization.name,
        orgSlug: m.organization.slug,
        role: m.role,
      }));
    } catch (e) {
      clerkMemberships = { error: e instanceof Error ? e.message : String(e) };
    }
  }

  const { data: ourOrgs } = await supabaseAdmin()
    .from("organizations")
    .select("id, name, clerk_org_id, plan, is_demo, deleted_at, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json({
    session: { userId, activeOrgId: orgId },
    clerkMemberships,
    ourOrganizations: ourOrgs ?? [],
  });
}
