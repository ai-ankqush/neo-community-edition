import "server-only";
import { auth } from "@clerk/nextjs/server";
import { ensureOrg } from "./org";
import { getAuthContext } from "@/server/identity/auth-context";
import { supabaseAdmin } from "./supabase";

/** Shared loader for portfolio rollup pages: org + use case name/tier map. */
export async function portfolioContext() {
  const { internalOrgId } = await getAuthContext();
  if (!internalOrgId) return null;
  const { data: useCases } = await supabaseAdmin()
    .from("use_cases")
    .select("id, name, tier, stage, business_function")
    .eq("org_id", internalOrgId)
    .neq("status", "archived");
  const ucMap = new Map<string, { name: string; tier: number | null; stage: string }>();
  for (const u of useCases ?? []) ucMap.set(u.id, { name: u.name, tier: u.tier, stage: u.stage });
  return { internalOrgId, useCases: useCases ?? [], ucMap };
}
