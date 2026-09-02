import { getAuthContext } from "@/server/identity/auth-context";
import { supabaseAdmin } from "@/lib/supabase";
import PlanCards from "./plan-cards";
import RedeemCode from "./redeem-code";
import { onRequestPricing } from "@/lib/brand";
import { isCommunity } from "@/ce/edition";

export default async function PlansPage() {
  const { orgId } = await getAuthContext();
  if (!orgId) return <p className="text-[var(--muted)]">Select an organization first.</p>;
  const internalOrgId = (await getAuthContext()).internalOrgId as string;

  // Community Edition has no plans or billing — every feature is included, unlimited,
  // on your own model key. Show that instead of pricing/upgrade cards.
  if (isCommunity()) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-xl font-bold text-[var(--text)]">Your plan</h1>
        <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <div className="text-[13px] font-bold uppercase tracking-wide text-[#22c55e]">Community Edition</div>
          <p className="mt-2 text-[14px] leading-relaxed text-[var(--text)]">
            Everything is included — unlimited use cases, all framework crosswalks, control
            verification, and Red Team — running on your own model key. There are no plans,
            limits, or billing to manage.
          </p>
          <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--muted)]">
            Want managed hosting or the commercial modules (AI Supply Chain, Vendor Risk,
            AI Action Fabric)? Those are part of the hosted product at neocontrol.ai.
          </p>
        </div>
      </div>
    );
  }

  const { data: org } = await supabaseAdmin()
    .from("organizations")
    .select("plan, plan_requested, comp_until")
    .eq("id", internalOrgId)
    .single();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-bold">Plans</h2>
        <p className="mt-1 text-[13px] text-[var(--faint)]">
          Start free, upgrade when your AI portfolio grows. All plans run the full
          9-stage assessment methodology.
        </p>
      </div>
      {/* Founding Reviewer is a Neo-only program — hidden on white-label / MSP deployments. */}
      {!onRequestPricing && <RedeemCode compUntil={(org?.comp_until as string | null) ?? null} />}
      <PlanCards currentPlan={org?.plan ?? "free"} requestedPlan={org?.plan_requested ?? null} />
    </div>
  );
}
