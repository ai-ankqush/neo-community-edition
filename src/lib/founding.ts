import "server-only";
import { supabaseAdmin } from "./supabase";
import { logAudit } from "./audit";

/**
 * Founding Reviewer comp: grants an org 30 days of full (Enterprise-level)
 * access with no card. Capped at FOUNDING_MAX total redemptions across all
 * orgs. One per workspace. The dormancy cron reverts the plan when comp_until
 * passes (see src/app/api/cron/dormancy/route.ts).
 */
export const FOUNDING_COMP_DAYS = 30;
export const FOUNDING_MAX = 50;

export type FoundingResult = "granted" | "already" | "full";

export async function grantFoundingComp(internalOrgId: string, actor = "system"): Promise<FoundingResult> {
  const sb = supabaseAdmin();

  const { data: org } = await sb.from("organizations").select("comp_until").eq("id", internalOrgId).single();
  if (org?.comp_until) return "already"; // one comp per workspace, ever

  const { count } = await sb.from("organizations").select("id", { count: "exact", head: true }).not("comp_until", "is", null);
  if ((count ?? 0) >= FOUNDING_MAX) return "full";

  const until = new Date(Date.now() + FOUNDING_COMP_DAYS * 86400_000).toISOString();
  await sb.from("organizations").update({ plan: "reviewer", comp_until: until }).eq("id", internalOrgId);
  await logAudit({ orgId: internalOrgId, actor, action: "billing.founding_claimed", detail: { days: FOUNDING_COMP_DAYS } });
  return "granted";
}
