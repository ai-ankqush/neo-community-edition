import "server-only";
import { supabaseAdmin } from "./supabase";
import { AUTH_PROVIDER } from "@/ce/auth-provider";

/**
 * Map a Clerk organization to our organizations row (creating it on first
 * touch). Returns the internal org uuid used to scope all tenant data.
 *
 * Community Edition (built-in auth) has no Clerk orgs — Sky's org id already IS
 * the internal organizations.id, so pass it straight through (no lookup/create).
 */
export async function ensureOrg(clerkOrgId: string, name?: string): Promise<string> {
  if (AUTH_PROVIDER === "builtin") return clerkOrgId;
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("organizations")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .maybeSingle();
  if (error) throw error;
  if (data) return data.id;

  // New self-serve orgs land unassigned; the dashboard forces a plan choice
  // (Free trial / Community / paid) before the app is usable.
  const { data: created, error: insertErr } = await sb
    .from("organizations")
    .insert({ clerk_org_id: clerkOrgId, name: name ?? clerkOrgId, plan: "unselected" })
    .select("id")
    .single();

  if (insertErr) {
    // Possible race on first concurrent requests - re-read before failing.
    const { data: again } = await sb
      .from("organizations")
      .select("id")
      .eq("clerk_org_id", clerkOrgId)
      .maybeSingle();
    if (again) return again.id;
    throw insertErr;
  }
  return created.id;
}
