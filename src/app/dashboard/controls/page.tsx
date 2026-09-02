import { supabaseAdmin } from "@/lib/supabase";
import { portfolioContext } from "@/lib/portfolio";
import { planFor } from "@/lib/plans";
import { KPICard } from "@/components/console/ui";
import { techForControl, type StackSelection } from "@/lib/tech-catalog";
import { isProviderCovered } from "@/lib/composer-context";
import ControlsTable, { type ControlRow } from "./controls-table";
import ControlsSubnav from "./controls-subnav";
import { withFrameworkFallback } from "@/lib/framework-fallback";
import { loadFrameworks } from "@/server/frameworks/custom";

export default async function ControlsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; pillar?: string; uc?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await portfolioContext();
  if (!ctx) return <p className="text-[var(--muted)]">Select an organization first.</p>;

  const [{ data: controls }, { data: orgRow }, { data: ucs }] = await Promise.all([
    supabaseAdmin()
      .from("control_items")
      .select("id, use_case_id, pillar, control, requirement, status, framework_refs, stack_implementation")
      .eq("org_id", ctx.internalOrgId)
      .order("pillar", { ascending: true }),
    supabaseAdmin()
      .from("organizations").select("plan, is_demo").eq("id", ctx.internalOrgId).single(),
    supabaseAdmin()
      .from("use_cases").select("id, stack").eq("org_id", ctx.internalOrgId),
  ]);
  const plan = planFor(orgRow?.plan);
  const composerOn = planFor(orgRow?.plan).integrations || Boolean(orgRow?.is_demo); // Integration Composer — available on every plan (integrations entitlement is universal)
  // which techs already have a customer-managed connector → offer "Verify now" instead of "Compose"
  const { data: customConns } = composerOn
    ? await supabaseAdmin().from("ai_custom_connectors").select("system_name").eq("org_id", ctx.internalOrgId).neq("status", "disabled")
    : { data: [] as { system_name: string }[] };
  const connectedTech = new Set((customConns ?? []).map((c) => (c.system_name as string).toLowerCase()));
  const stackByUc = new Map<string, StackSelection | null>((ucs ?? []).map((u) => [u.id as string, (u.stack as StackSelection) ?? null]));

  // Customer-owned frameworks — surfaced as extra crosswalk columns alongside the built-ins.
  const { frameworks: customFrameworks, mappings: customMappings } = await loadFrameworks(ctx.internalOrgId);

  const all = controls ?? [];
  const counts = {
    ready: all.filter((c) => c.status === "in_place").length,
    partial: all.filter((c) => c.status === "partial").length,
    gap: all.filter((c) => c.status === "gap").length,
  };

  const rows: ControlRow[] = all.map((c) => {
    const uc = ctx.ucMap.get(c.use_case_id);
    const tech = techForControl(c.control, stackByUc.get(c.use_case_id) ?? null);
    const lead = tech[0];
    return {
      id: c.id,
      use_case_id: c.use_case_id,
      ucName: uc?.name ?? "—",
      ucTier: uc?.tier ?? null,
      pillar: c.pillar,
      control: c.control,
      requirement: c.requirement,
      status: c.status,
      // Backfill missing framework refs (incl. SR 11-7 / NYDFS added later) by the
      // control's pillar, so the crosswalk view is never empty for older controls.
      framework_refs: withFrameworkFallback((c.pillar as number) ?? 0, c.framework_refs as Record<string, string> | null) as unknown as Record<string, string>,
      tech,
      // Offer to compose a connector when the configure-in tech has no Neo connector yet.
      compose: composerOn && lead && !isProviderCovered(lead) ? lead : null,
      // If a custom connector already exists for that tech, it's a one-tap "Verify now".
      connectorReady: composerOn && lead ? connectedTech.has(lead.toLowerCase()) : false,
    };
  });

  return (
    <div className="flex flex-col gap-5">
      <ControlsSubnav />
      <div>
        <h2 className="text-xl font-bold">Controls Coverage</h2>
        <p className="mt-1 text-[13px] text-[var(--faint)]">
          All selected controls across the portfolio, with framework crosswalk
        </p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <KPICard label="Total Controls" value={all.length} href="/dashboard/controls" />
        <KPICard label="Ready" value={counts.ready} color="#22c55e" href="/dashboard/controls?status=in_place" />
        <KPICard label="Partial" value={counts.partial} color="#f59e0b" href="/dashboard/controls?status=partial" />
        <KPICard label="Not Ready" value={counts.gap} color="#ef4444" href="/dashboard/controls?status=gap" />
      </div>
      <ControlsTable
        rows={rows}
        allCrosswalks={plan.allCrosswalks}
        initialStatus={sp.status ?? ""}
        initialPillar={sp.pillar ?? ""}
        initialUc={sp.uc ?? ""}
        customFrameworks={customFrameworks.map((f) => ({ id: f.id, name: f.name, authority: f.authority }))}
        customMappings={customMappings.map((m) => ({ framework_id: m.framework_id, scope: m.scope, pillar: m.pillar, control_id: m.control_id, reference: m.reference, status: m.status, source: m.source }))}
      />
    </div>
  );
}
