import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { readSession } from "@/server/sky/session";
import { IdentityError } from "../types";
import type { Principal } from "../types";
import type { Role } from "@/lib/types/stages";

/**
 * Sky host-session adapter — Neo-native, zero identity vendor. Turns a Sky session (Neo's own accounts)
 * into the neutral Principal the platform speaks. This is the human login path for Sky; Clerk never
 * appears here. Enterprise SSO (Sky as its own OIDC relying-party) will establish the SAME Sky session,
 * so this adapter serves local accounts and SSO users identically.
 */
export async function resolveFromSkySession(): Promise<Principal> {
  const session = await readSession();
  if (!session) throw new IdentityError(401, "Not signed in to Sky.");

  const { data } = await supabaseAdmin()
    .from("sky_memberships")
    .select("role")
    .eq("org_id", session.orgId)
    .eq("user_id", session.userId)
    .maybeSingle();

  const role = (data?.role as Role | undefined) ?? "viewer";
  return {
    tenantId: session.orgId,
    subjectId: session.userId,
    roles: [role],
    idp: "sky",
    via: "session",
  };
}
