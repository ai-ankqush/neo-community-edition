import { auth } from "@clerk/nextjs/server";
import { getAuthContext } from "@/server/identity/auth-context";
import { ensureOrg } from "@/lib/org";
import { supabaseAdmin } from "@/lib/supabase";
import { loadControlGraph } from "@/server/control-graph/load";
import InsightsView from "./insights-view";

export const dynamic = "force-dynamic";

/** Findings — ONE thing: everything across your AI that needs a decision, ranked.
 *  The live activity log lives in the Action Fabric (Activity); the shared-controls
 *  leverage tip is an estate insight — neither belongs on this to-do surface. */
export default async function ControlGraphInsightsPage() {
  const { orgId } = await getAuthContext();
  if (!orgId) return <p className="text-[var(--muted)]">Select an organization first.</p>;
  const internalOrgId = (await getAuthContext()).internalOrgId as string;
  const [{ data: org }, graph] = await Promise.all([
    supabaseAdmin().from("organizations").select("is_demo").eq("id", internalOrgId).single(),
    loadControlGraph(internalOrgId),
  ]);
  return <InsightsView graph={graph} actionFabricEnabled={Boolean(org?.is_demo)} />;
}
