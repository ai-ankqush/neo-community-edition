import "server-only";
import { supabaseAdmin } from "@/lib/supabase";

/** Members of a tenant with the authz roles they hold — the data behind the access screen. */
export interface MemberView {
  userId: string;
  email: string;
  displayName: string | null;
  legacyRole: string;
  roleKeys: string[];
  twoFactor: boolean;
}

export async function listMembers(orgId: string): Promise<MemberView[]> {
  const sb = supabaseAdmin();
  const { data: memberships } = await sb.from("sky_memberships").select("user_id, role").eq("org_id", orgId);
  const ids = (memberships ?? []).map((m) => m.user_id as string);
  if (!ids.length) return [];

  const [{ data: users }, { data: assignments }, { data: totp }] = await Promise.all([
    sb.from("sky_users").select("user_id, email, display_name").in("user_id", ids),
    sb.from("sky_role_assignments").select("principal_id, role_key").eq("org_id", orgId).eq("principal_type", "user").in("principal_id", ids),
    sb.from("sky_totp").select("user_id, confirmed_at").in("user_id", ids),
  ]);

  const byUser = new Map(ids.map((id) => [id, [] as string[]]));
  for (const a of assignments ?? []) byUser.get(a.principal_id as string)?.push(a.role_key as string);
  const mfa = new Set((totp ?? []).filter((t) => t.confirmed_at).map((t) => t.user_id as string));
  const userRow = new Map((users ?? []).map((u) => [u.user_id as string, u]));

  return (memberships ?? []).map((m) => {
    const id = m.user_id as string;
    const u = userRow.get(id);
    return {
      userId: id,
      email: (u?.email as string) ?? "",
      displayName: (u?.display_name as string) ?? null,
      legacyRole: (m.role as string) ?? "viewer",
      roleKeys: byUser.get(id) ?? [],
      twoFactor: mfa.has(id),
    };
  });
}
