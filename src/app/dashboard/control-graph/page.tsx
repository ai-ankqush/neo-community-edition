import { auth } from "@clerk/nextjs/server";
import { getAuthContext } from "@/server/identity/auth-context";
import { ensureOrg } from "@/lib/org";
import { loadControlGraph } from "@/server/control-graph/load";
import { loadControlPictures } from "@/server/control-graph/load-pictures";
import { supabaseAdmin } from "@/lib/supabase";
import { canSupplyChain } from "@/lib/supply-chain-access";
import EstateView from "./estate-view";

export const dynamic = "force-dynamic";

export default async function ControlGraphPage() {
  const { orgId } = await getAuthContext();
  if (!orgId) return <p className="text-[var(--muted)]">Select an organization first.</p>;
  const internalOrgId = (await getAuthContext()).internalOrgId as string;
  const [graph, pictures, { data: org }] = await Promise.all([
    loadControlGraph(internalOrgId),
    loadControlPictures(internalOrgId),
    supabaseAdmin().from("organizations").select("plan, is_demo").eq("id", internalOrgId).single(),
  ]);
  const pics = pictures.map((p) => ({ id: p.id, name: p.name, tier: p.tier, picture: p.picture }));
  const showSupplyChain = canSupplyChain(org?.plan, Boolean(org?.is_demo));
  return <div data-tour="control-graph"><EstateView graph={graph} pics={pics} showSupplyChain={showSupplyChain} /></div>;
}
