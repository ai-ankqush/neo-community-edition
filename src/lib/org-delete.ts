import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { supabaseAdmin } from "./supabase";

/** Days an org sits recoverable after a delete before it is permanently purged. */
export const PURGE_HOLD_DAYS = 30;

/** Soft delete: lock the org out of the app and schedule a hard purge. Reversible
 *  via restoreOrg until purge_after passes. */
export async function softDeleteOrg(orgId: string, actor: string): Promise<void> {
  const purgeAfter = new Date(Date.now() + PURGE_HOLD_DAYS * 86400_000).toISOString();
  await supabaseAdmin()
    .from("organizations")
    .update({ deleted_at: new Date().toISOString(), deleted_by: actor, purge_after: purgeAfter })
    .eq("id", orgId);
}

/** Undo a soft delete - clears the hold and restores access. */
export async function restoreOrg(orgId: string): Promise<void> {
  await supabaseAdmin()
    .from("organizations")
    .update({ deleted_at: null, deleted_by: null, purge_after: null })
    .eq("id", orgId);
}

/** Permanent purge: remove the Clerk org and the DB row (children cascade).
 *  Irreversible. Called by the cron once the hold window expires. */
export async function purgeOrgHard(orgId: string, clerkOrgId: string): Promise<void> {
  try {
    const client = await clerkClient();
    await client.organizations.deleteOrganization(clerkOrgId);
  } catch {
    /* org may already be gone in Clerk */
  }
  await supabaseAdmin().from("organizations").delete().eq("id", orgId);
}
