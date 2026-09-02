import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { portfolioContext } from "@/lib/portfolio";
import { requireSession } from "@/lib/rbac";
import { Card, CardLabel, KPICard, TierBadge, RecBadge } from "@/components/console/ui";
import { TIER_COLORS } from "@/components/console/theme";
import { canSupplyChain } from "@/lib/supply-chain-access";
import { loadSupplyChain } from "@/server/supply-chain/load";
import UcFilter from "./uc-filter";
import ConditionItem from "@/components/console/condition-item";
import { CoverageBar, CoverageLegend } from "@/components/console/coverage-bar";
import { weightedCoverage, normalizeTargets } from "@/lib/risk-tolerance";

export default async function ExecutivePage({
  searchParams,
}: {
  searchParams: Promise<{ uc?: string; filter?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await portfolioContext();
  if (!ctx) return <p className="text-[var(--muted)]">Select an organization first.</p>;
  const sb = supabaseAdmin();

  const [{ data: approvals }, { data: conditions }, { data: controls }] = await Promise.all([
    sb.from("approvals")
      .select("use_case_id, decision, rationale, created_at")
      .eq("org_id", ctx.internalOrgId)
      .order("created_at", { ascending: false }),
    sb.from("conditions")
      .select("id, use_case_id, text, status")
      .eq("org_id", ctx.internalOrgId)
      .eq("status", "open"),
    sb.from("control_items")
      .select("use_case_id, status")
      .eq("org_id", ctx.internalOrgId),
  ]);

  const { role } = await requireSession();
  const canAct = role === "org_admin" || role === "assessor";

  const latest = new Map<string, { decision: string; rationale: string | null }>();
  for (const a of approvals ?? []) {
    if (!latest.has(a.use_case_id))
      latest.set(a.use_case_id, { decision: a.decision, rationale: a.rationale });
  }

  const total = ctx.useCases.length;
  const highRiskUCs = ctx.useCases.filter((u) => (u.tier ?? 0) >= 4);
  const highRisk = highRiskUCs.length;
  const decided = latest.size;
  const openConditions = (conditions ?? []).length;
  const gaps = (controls ?? []).filter((c) => c.status === "gap").length;

  // AI Supply Chain rollup (gated — Enterprise / demo)
  const { data: orgRow } = await sb.from("organizations").select("plan, is_demo, risk_tolerance").eq("id", ctx.internalOrgId).single();

  // per-use-case weighted coverage, coloured against the org's per-tier appetite
  const targets = normalizeTargets(orgRow?.risk_tolerance);
  const covByUc = new Map<string, { pct: number; required: number; hasGap: boolean }>();
  for (const uc of ctx.useCases) {
    covByUc.set(uc.id, weightedCoverage((controls ?? []).filter((c) => c.use_case_id === uc.id)));
  }
  const showSupplyChain = canSupplyChain(orgRow?.plan, Boolean(orgRow?.is_demo));
  const SC_GRADE_COLOR: Record<string, string> = { None: "var(--muted)", Low: "#22c55e", Moderate: "#84cc16", Elevated: "#f59e0b", High: "#ef4444" };
  let sc = { risk: "—", transparency: 0, deps: 0, findings: 0 };
  if (showSupplyChain) {
    try {
      const { ledger } = await loadSupplyChain(ctx.internalOrgId, undefined, { live: false });
      sc = { risk: ledger.riskGrade, transparency: ledger.transparency, deps: ledger.counts.total, findings: ledger.findings.length };
    } catch (err) { console.error("executive supply-chain rollup failed", err); }
  }

  // filter the per-use-case cards
  let shown = ctx.useCases;
  if (sp.uc) shown = shown.filter((u) => u.id === sp.uc);
  else if (sp.filter === "high_risk") shown = highRiskUCs;
  else if (sp.filter === "decided") shown = shown.filter((u) => latest.has(u.id));
  else if (sp.filter === "conditions") {
    const withCond = new Set((conditions ?? []).map((c) => c.use_case_id));
    shown = shown.filter((u) => withCond.has(u.id));
  }
  const activeFilter = sp.uc || sp.filter;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-bold">Executive Summary</h2>
        <p className="mt-1 text-[13px] text-[var(--faint)]">
          Decision-ready view of the AI portfolio for leadership and governance
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <KPICard label="Use Cases Assessed" value={total} href="/dashboard/executive" />
        <KPICard label="High Risk (T4/T5)" value={highRisk} color="#f97316" href="/dashboard/executive?filter=high_risk" />
        <KPICard label="Decisions Issued" value={decided} color="#3b82f6" href="/dashboard/executive?filter=decided" />
        <KPICard label="Open Conditions" value={openConditions} color="#f59e0b" href="/dashboard/executive?filter=conditions" />
      </div>

      {/* per-use-case filter */}
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className="text-[var(--faint)]">Show:</span>
        <Link href="/dashboard/executive" className={`rounded-md border px-2.5 py-1 ${!activeFilter ? "border-[#3b82f6] text-[#3b82f6]" : "border-[var(--border)] text-[var(--muted)]"}`}>All</Link>
        <Link href="/dashboard/executive?filter=high_risk" className={`rounded-md border px-2.5 py-1 ${sp.filter === "high_risk" ? "border-[#f97316] text-[#f97316]" : "border-[var(--border)] text-[var(--muted)]"}`}>High risk</Link>
        <Link href="/dashboard/executive?filter=decided" className={`rounded-md border px-2.5 py-1 ${sp.filter === "decided" ? "border-[#3b82f6] text-[#3b82f6]" : "border-[var(--border)] text-[var(--muted)]"}`}>Decided</Link>
        <Link href="/dashboard/executive?filter=conditions" className={`rounded-md border px-2.5 py-1 ${sp.filter === "conditions" ? "border-[#f59e0b] text-[#f59e0b]" : "border-[var(--border)] text-[var(--muted)]"}`}>Open conditions</Link>
        <UcFilter useCases={ctx.useCases.map((u) => ({ id: u.id, name: u.name }))} current={sp.uc ?? ""} />
      </div>

      <Card accent="#3b82f6">
        <CardLabel>Portfolio Insight</CardLabel>
        <p className="text-sm leading-relaxed text-[var(--text)]">
          {total === 0
            ? "No use cases assessed yet."
            : `${highRisk} of ${total} use case${total === 1 ? "" : "s"} ${highRisk === 1 ? "is" : "are"} Tier 4 or above, requiring action-governance controls. ` +
              `${decided} ${decided === 1 ? "has" : "have"} a formal decision on record` +
              (openConditions > 0
                ? `, with ${openConditions} approval condition${openConditions === 1 ? "" : "s"} still open. `
                : ". ") +
              (gaps > 0
                ? `The portfolio carries ${gaps} control gap${gaps === 1 ? "" : "s"} - the recommended focus is closing conditions on the highest-tier use cases first.`
                : "No open control gaps across the portfolio.")}
        </p>
      </Card>

      {showSupplyChain && (
        <Card accent={SC_GRADE_COLOR[sc.risk] ?? "#3b82f6"}>
          <div className="mb-3 flex items-center justify-between">
            <CardLabel>AI Supply Chain — the AI behind your AI</CardLabel>
            <Link href="/dashboard/supply-chain" className="text-[12px] font-semibold text-[#3b82f6] hover:underline">Open →</Link>
          </div>
          <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
            <KPICard label="AI risk grade" value={sc.risk === "None" ? "—" : sc.risk} color={SC_GRADE_COLOR[sc.risk] ?? "var(--text)"} sub={sc.risk === "None" ? "No AI dependencies yet" : undefined} href="/dashboard/supply-chain" />
            <KPICard label="Transparency" value={`${sc.transparency}%`} sub="Verified vs. declared" href="/dashboard/supply-chain" />
            <KPICard label="Dependencies" value={sc.deps} sub="Models, data, tools, vendors" href="/dashboard/supply-chain" />
            <KPICard label="Open findings" value={sc.findings} color={sc.findings ? "#f59e0b" : "#22c55e"} href="/dashboard/supply-chain" />
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--muted)]">
            Every model, dataset, tool and third-party AI behind the portfolio, and how strongly each is proven. Full due-diligence reports are in <Link href="/dashboard/reports" className="text-[#3b82f6] hover:underline">Reports</Link>.
          </p>
        </Card>
      )}

      {shown.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wide text-[var(--muted)]">Use cases</h3>
          <CoverageLegend />
        </div>
      )}

      {shown.map((uc) => {
        const dec = latest.get(uc.id);
        const ucConditions = (conditions ?? []).filter((c) => c.use_case_id === uc.id);
        const cov = covByUc.get(uc.id);
        return (
          <Card key={uc.id} accent={TIER_COLORS[uc.tier ?? 2]}>
            <div className="mb-2 flex items-center gap-3">
              <Link href={`/dashboard/use-cases/${uc.id}`} className="font-semibold hover:underline">
                {uc.name}
              </Link>
              {uc.tier && <TierBadge tier={uc.tier} />}
              {dec && <RecBadge rec={dec.decision} />}
              {!dec && <span className="text-xs text-[var(--faint)]">In assessment</span>}
            </div>
            {cov && cov.required > 0 && (
              <div className="mb-3">
                <CoverageBar pct={cov.pct} tier={uc.tier} targets={targets} hasGap={cov.hasGap} />
              </div>
            )}
            {dec?.rationale && (
              <p className="text-[13px] leading-relaxed text-[var(--muted)]">{dec.rationale}</p>
            )}
            {ucConditions.length > 0 && (
              <ul className="mt-3 space-y-1.5 text-[13px] text-[var(--text)]">
                {ucConditions.map((c) => (
                  <ConditionItem key={c.id} id={c.id} text={c.text} canAct={canAct} />
                ))}
              </ul>
            )}
          </Card>
        );
      })}
    </div>
  );
}
