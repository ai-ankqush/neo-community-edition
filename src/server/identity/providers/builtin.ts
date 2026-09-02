import "server-only";
import { readSession } from "@/server/sky/session";
import { supabaseAdmin } from "@/lib/supabase";
import { IdentityError } from "../types";
import type { Principal } from "../types";
import type { Role } from "@/lib/types/stages";

/**
 * Built-in host-session adapter — the Community Edition counterpart to `host.ts`.
 *
 * Instead of Clerk, it reads Neo's own Sky session (revocable, no identity vendor) and
 * turns it into the same neutral Principal the rest of the app already consumes. Sky's
 * org_id is the internal `organizations.id`, and the member's legacy role comes from
 * `sky_memberships`. Everything downstream is identical to the Clerk path.
 */
export async function resolveFromBuiltinSession(): Promise<Principal> {
  const s = await readSession();
  if (!s) throw new IdentityError(401, "Not signed in.");

  const sb = supabaseAdmin();
  const { data: membership } = await sb
    .from("sky_memberships")
    .select("role")
    .eq("user_id", s.userId)
    .eq("org_id", s.orgId)
    .maybeSingle();
  const role = ((membership?.role as Role) ?? "viewer") as Role;

  const { data: assignments } = await sb
    .from("sky_role_assignments")
    .select("role_key")
    .eq("org_id", s.orgId)
    .eq("principal_type", "user")
    .eq("principal_id", s.userId);

  return {
    tenantId: s.orgId,
    subjectId: s.userId,
    roles: [role],
    roleKeys: (assignments ?? []).map((a) => a.role_key as string),
    idp: "builtin",
    via: "session",
  };
}
