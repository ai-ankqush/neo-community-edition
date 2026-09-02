import Link from "next/link";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { ensureOrg } from "@/lib/org";
import { supabaseAdmin } from "@/lib/supabase";
import { Card, CardLabel, KPICard, TierBadge, RecBadge } from "@/components/console/ui";
import { TierDistributionChart, PillarCoverageChart } from "@/components/console/charts";
import { TIER_COLORS, PILLAR_NAMES } from "@/components/console/theme";
import { planFor } from "@/lib/plans";
import { canSupplyChain } from "@/lib/supply-chain-access";
import { loadSupplyChain } from "@/server/supply-chain/load";
import { loadControlGraph } from "@/server/control-graph/load";
import { runInference } from "@/lib/control-graph-inference";
import Concierge from "@/components/console/concierge";
import GettingStarted from "@/components/console/getting-started";
import CuratedHome from "@/components/console/curated-home";
import ModeToggle from "@/components/console/mode-toggle";
import { buildCuratedHome } from "@/lib/curated-home";
import type { ControlGraph } from "@/lib/control-graph";
import { cookies } from "next/headers";
import { communityActive } from "@/ce/server";
import { getAuthContext } from "@/server/identity/auth-context";

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { orgId, userId, internalOrgId } = await getAuthContext();
  const previewOnboarding = (await searchParams)?.welcome === "1"; // /dashboard?welcome=1 to preview the concierge
  if (!internalOrgId) return <p className="text-[var(--muted)]">Select an organization first.</p>;
  const sb = supabaseAdmin();

  let orgName = "Portfolio";
  if (orgId) {
    try {
      const client = await clerkClient();
      const org = await client.organizations.getOrganization({ organizationId: orgId });
      orgName = org.name;
      // keep our organizations row in sync with the Clerk name
      await sb.from("organizations").update({ name: org.name }).eq("id", internalOrgId);
    } catch {
      /* fall back to generic heading (built-in orgs, or Clerk lookup miss) */
    }
  }

  const [{ data: useCases }, { data: controls }, { data: conditions }, { data: approvals }] =
    await Promise.all([
      sb.from("use_cases")
        .select("id, name, stage, tier, patterns")
        .eq("org_id", internalOrgId).neq("status", "archived"),
      sb.from("control_items")
        .select("pillar, status, use_case_id")
        .eq("org_id", internalOrgId),
      sb.from("conditions")
        .select("id, status")
        .eq("org_id", internalOrgId).eq("status", "open"),
      sb.from("approvals")
        .select("use_case_id, decision, created_at")
        .eq("org_id", internalOrgId).order("created_at", { ascending: false }),
    ]);

  const ucs = useCases ?? [];
  const total = ucs.length;
  const highRisk = ucs.filter((u) => (u.tier ?? 0) >= 4);
  const gaps = (controls ?? []).filter((c) => c.status === "gap").length;
  const openConditions = (conditions ?? []).length;

  const latestRec = new Map<string, string>();
  for (const a of approvals ?? []) {
    if (!latestRec.has(a.use_case_id)) latestRec.set(a.use_case_id, a.decision);
  }

  const tierDist = [1, 2, 3, 4, 5].map((t) => ({
    tier: `Tier ${t}`,
    count: ucs.filter((u) => u.tier === t).length,
    fill: TIER_COLORS[t],
  }));

  const pillarCoverage = Object.entries(PILLAR_NAMES).map(([num, name]) => {
    const all = (controls ?? []).filter((c) => c.pillar === Number(num));
    const ready = all.filter((c) => c.status === "in_place").length;
    const partial = all.filter((c) => c.status === "partial").length;
    // in_place = full credit, partial = half. 0% means controls exist but none verified yet.
    return { pillar: name, coverage: all.length ? Math.round(((ready + partial * 0.5) / all.length) * 100) : 0 };
  });

  const priority = ucs.filter((u) => (u.tier ?? 0) >= 3);

  // ---- first-run onboarding (concierge + getting-started checklist) ----
  let onbWelcomed = true, onbDismissed = true, onbFirstName: string | null = null;
  const onbSteps = {
    assessed: ucs.some((u) => u.tier != null),
    connected: false,
    invited: false,
    decided: (approvals ?? []).length > 0,
  };
  if (userId) {
    const [onbRow, conn, members, pending] = await Promise.all([
      sb.from("user_onboarding").select("welcomed_at, checklist_dismissed_at").eq("user_id", userId).eq("org_id", internalOrgId).maybeSingle(),
      sb.from("org_connections").select("id", { count: "exact", head: true }).eq("org_id", internalOrgId).eq("status", "connected"),
      sb.from("memberships").select("id", { count: "exact", head: true }).eq("org_id", internalOrgId),
      sb.from("pending_invites").select("id", { count: "exact", head: true }).eq("org_id", internalOrgId),
    ]);
    onbWelcomed = Boolean(onbRow.data?.welcomed_at);
    onbDismissed = Boolean(onbRow.data?.checklist_dismissed_at);
    onbSteps.connected = (conn.count ?? 0) > 0;
    onbSteps.invited = (members.count ?? 0) > 1 || (pending.count ?? 0) > 0;
    try {
      const client = await clerkClient();
      onbFirstName = (await client.users.getUser(userId)).firstName ?? null;
    } catch { /* greet generically */ }
  }
  const allOnbDone = onbSteps.assessed && onbSteps.connected && onbSteps.invited && onbSteps.decided;

  // Vendor AI Review summary (gated — demo / Enterprise+Reviewer when released)
  const { data: orgRow } = await sb.from("organizations").select("plan, is_demo").eq("id", internalOrgId).single();
  // Community Edition hides Vendor Review, Supply Chain, and Shadow AI (Red Team stays).
  const community = await communityActive();
  const showVendor = !community && (planFor(orgRow?.plan).vendorReview || Boolean(orgRow?.is_demo));
  let vendor = { total: 0, decided: 0, highRisk: 0, rejected: 0 };
  if (showVendor) {
    const { data: vrs } = await sb.from("vendor_reviews").select("tier, status, decision").eq("org_id", internalOrgId).neq("status", "archived");
    const list = vrs ?? [];
    vendor = {
      total: list.length,
      decided: list.filter((v) => v.status === "decided").length,
      highRisk: list.filter((v) => (v.tier ?? 0) >= 4).length,
      rejected: list.filter((v) => v.decision === "reject").length,
    };
  }

  // AI Supply Chain summary (gated — Enterprise / demo). live:false keeps the
  // dashboard fast; the full enriched view loads on the Supply Chain page itself.
  const showSupplyChain = !community && canSupplyChain(orgRow?.plan, Boolean(orgRow?.is_demo));
  const SC_GRADE_COLOR: Record<string, string> = { None: "var(--muted)", Low: "#22c55e", Moderate: "#84cc16", Elevated: "#f59e0b", High: "#ef4444" };
  let sc = { risk: "—", transparency: 0, deps: 0, findings: 0 };
  if (showSupplyChain) {
    try {
      const { ledger } = await loadSupplyChain(internalOrgId, undefined, { live: false });
      sc = { risk: ledger.riskGrade, transparency: ledger.transparency, deps: ledger.counts.total, findings: ledger.findings.length };
    } catch (err) { console.error("dashboard supply-chain summary failed", err); }
  }

  // Red Team summary (Enterprise / demo) — discovered scenarios + Live Fire proof.
  const showRedTeam = community || planFor(orgRow?.plan).redTeam || Boolean(orgRow?.is_demo);
  let rt = { scenarios: 0, exposed: 0, blocked: 0, exploited: 0 };
  if (showRedTeam) {
    try {
      const [{ data: rf }, { count: exploited }] = await Promise.all([
        sb.from("red_team_findings").select("exposure").eq("org_id", internalOrgId),
        sb.from("red_team_results").select("*", { count: "exact", head: true }).eq("org_id", internalOrgId).eq("verdict", "confirmed"),
      ]);
      const list = rf ?? [];
      rt = {
        scenarios: list.length,
        exposed: list.filter((x) => x.exposure === "exposed").length,
        blocked: list.filter((x) => x.exposure === "blocked").length,
        exploited: exploited ?? 0,
      };
    } catch (err) { console.error("dashboard red-team summary failed", err); }
  }

  // Shadow AI summary — undeclared AI found in the money trail (demo / when signals exist).
  let sa = { total: 0, confirmed: 0, undeclared: 0, converted: 0 };
  let showShadowAI = Boolean(orgRow?.is_demo);
  try {
    const { data: sig } = await sb.from("shadow_ai_signals").select("classification, status").eq("org_id", internalOrgId).neq("status", "false_positive");
    const list = sig ?? [];
    sa = {
      total: list.length,
      confirmed: list.filter((s) => s.classification === "Confirmed AI spend").length,
      undeclared: list.filter((s) => s.status !== "converted").length,
      converted: list.filter((s) => s.status === "converted").length,
    };
    showShadowAI = showShadowAI || list.length > 0;
  } catch (err) { console.error("dashboard shadow-ai summary failed", err); }
  if (community) showShadowAI = false;

  // AI Control Graph findings — the cockpit deep-links into Findings (all plans).
  // We keep the graph around: the curated home derives entirely from it.
  let cg = { total: 0, high: 0 };
  let controlGraph: ControlGraph | null = null;
  try {
    controlGraph = await loadControlGraph(internalOrgId);
    const f = runInference(controlGraph.useCases);
    cg = { total: f.length, high: f.filter((x) => x.severity === "high").length };
  } catch (err) { console.error("dashboard control-graph summary failed", err); }

  // ---- Curated mode (all orgs; default view) ----
  // neo_mode cookie picks the view; every org defaults to Curated, with Advanced
  // one click away and remembered. The full dashboard below is the Advanced view.
  const mode = (await cookies()).get("neo_mode")?.value === "advanced" ? "advanced" : "curated";
  if (mode === "curated" && controlGraph) {
    return <CuratedHome model={buildCuratedHome(controlGraph)} orgName={orgName} />;
  }

  return (
    <div className="flex flex-col gap-5">
      {(previewOnboarding || (!onbWelcomed && total === 0)) && <Concierge firstName={onbFirstName} />}
      {(onbWelcomed || total > 0) && !onbDismissed && !allOnbDone && <GettingStarted steps={onbSteps} />}

      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-xl font-bold">{orgName} Dashboard</h2>
          <p className="mt-1 text-[13px] text-[var(--faint)]">
            AI control posture across {total} use case{total === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ModeToggle current="advanced" />
          <Link
            href="/dashboard/use-cases/new"
            className="rounded-md bg-[#3b82f6] px-4 py-2 text-[13px] font-semibold text-white"
          >
            New use case
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <KPICard label="Total Use Cases" value={total} href="/dashboard/use-cases" />
        <KPICard label="High Risk (T4/T5)" value={highRisk.length} color="#f97316"
          sub={highRisk.map((h) => h.name).slice(0, 2).join(", ")} href="/dashboard/heatmap" />
        <KPICard label="Control Gaps" value={gaps} color="#f59e0b" sub="Controls not ready"
          href="/dashboard/controls?status=gap" />
        <KPICard label="Open Conditions" value={openConditions} color="#ef4444" sub="From approvals"
          href="/dashboard/decision" />
      </div>

      {cg.total > 0 && (
        <Link href="/dashboard/control-graph/insights"
          className="flex items-center gap-3 rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-4 hover:border-[#0d948880]"
          style={{ borderLeft: "3px solid #0d9488" }}>
          <div>
            <div className="text-[13px] font-semibold text-[var(--text)]">AI Control Graph findings</div>
            <div className="text-[12px] text-[var(--muted)]">
              {cg.total === 0 ? "No governance findings across your estate — clear." : `${cg.total} finding${cg.total === 1 ? "" : "s"} across your AI estate`}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {cg.high > 0 && <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ color: "#ef4444", background: "#ef44441f" }}>{cg.high} high</span>}
            <span className="text-[12px] font-semibold text-[#0d9488]">Open findings →</span>
          </div>
        </Link>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        <Card dataTour="tier-distribution">
          <CardLabel>Risk Tier Distribution</CardLabel>
          <TierDistributionChart data={tierDist} />
          <div className="mt-3 space-y-1 border-t border-[var(--border)] pt-3">
            {[
              ["T1", "#22c55e", "Low-risk — public or non-sensitive data, no decisions or actions"],
              ["T2", "#84cc16", "Internal enterprise data or vendor AI — no decisions or actions"],
              ["T3", "#f59e0b", "Decision-supporting — influences business, customer, or records decisions"],
              ["T4", "#f97316", "Action-capable — can trigger tools, APIs, or workflows"],
              ["T5", "#ef4444", "High-impact — autonomous, regulated, or hard-to-reverse AI"],
            ].map(([t, c, d]) => (
              <div key={t} className="flex items-start gap-2 text-[11px] leading-snug text-[var(--muted)]">
                <span className="mt-[1px] inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-bold text-black" style={{ backgroundColor: c }}>{t}</span>
                <span>{d}</span>
              </div>
            ))}
            <p className="pt-1 text-[10px] text-[var(--faint)]">Tier sets the control depth, evidence, and approval an AI use case requires.</p>
          </div>
        </Card>
        <Card dataTour="pillar-coverage">
          <CardLabel>Control Implementation by Pillar</CardLabel>
          <p className="-mt-1 mb-1 text-[11px] text-[var(--faint)]">% of controls verified in place · 0% until you verify controls</p>
          <PillarCoverageChart data={pillarCoverage} />
        </Card>
      </div>

      {showSupplyChain && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <CardLabel>AI Supply Chain — the AI behind your AI</CardLabel>
            <Link href="/dashboard/supply-chain" className="text-[12px] font-semibold text-[#3b82f6] hover:underline">View all →</Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
            <KPICard label="AI risk grade" value={sc.risk === "None" ? "—" : sc.risk} color={SC_GRADE_COLOR[sc.risk] ?? "var(--text)"} sub={sc.risk === "None" ? "No AI dependencies yet" : undefined} href="/dashboard/supply-chain" />
            <KPICard label="Transparency" value={`${sc.transparency}%`} sub="Verified vs. declared" href="/dashboard/supply-chain" />
            <KPICard label="Dependencies" value={sc.deps} sub="Models, data, tools, vendors" href="/dashboard/supply-chain" />
            <KPICard label="Open findings" value={sc.findings} color={sc.findings ? "#f59e0b" : "#22c55e"} href="/dashboard/supply-chain" />
          </div>
        </div>
      )}

      {showVendor && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <CardLabel>Vendor AI Risk — third-party products under review</CardLabel>
            <Link href="/dashboard/vendor-reviews" className="text-[12px] font-semibold text-[#3b82f6] hover:underline">View all →</Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
            <KPICard label="Vendor Reviews" value={vendor.total} href="/dashboard/vendor-reviews" />
            <KPICard label="Decided" value={vendor.decided} color="#22c55e" href="/dashboard/vendor-reviews" />
            <KPICard label="High Risk (T4/T5)" value={vendor.highRisk} color="#f97316" href="/dashboard/vendor-reviews" />
            <KPICard label="Rejected" value={vendor.rejected} color="#ef4444" href="/dashboard/vendor-reviews" />
          </div>
        </div>
      )}

      {showRedTeam && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <CardLabel>Red Team — attack it, prove what breaks</CardLabel>
            <Link href="/dashboard/red-team" className="text-[12px] font-semibold text-[#3b82f6] hover:underline">Open Red Team →</Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
            <KPICard label="Scenarios" value={rt.scenarios} sub="Discovered across your AI" href="/dashboard/red-team?view=sim" />
            <KPICard label="Exposed" value={rt.exposed} color="#ef4444" sub="No verified control stops these" href="/dashboard/red-team?view=sim" />
            <KPICard label="Broken by control" value={rt.blocked} color="#22c55e" href="/dashboard/red-team?view=sim" />
            <KPICard label="Exploited live" value={rt.exploited} color={rt.exploited ? "#ef4444" : "#22c55e"} sub="Confirmed in Live Fire" href="/dashboard/red-team" />
          </div>
        </div>
      )}

      {showShadowAI && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <CardLabel>Shadow AI — undeclared AI in the money trail</CardLabel>
            <Link href="/dashboard/control-graph/shadow-ai" className="text-[12px] font-semibold text-[#3b82f6] hover:underline">View all →</Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
            <KPICard label="AI spend signals" value={sa.total} href="/dashboard/control-graph/shadow-ai" />
            <KPICard label="Confirmed" value={sa.confirmed} color="#ef4444" href="/dashboard/control-graph/shadow-ai" />
            <KPICard label="Undeclared" value={sa.undeclared} color={sa.undeclared ? "#f59e0b" : "#22c55e"} sub="Not yet governed" href="/dashboard/control-graph/shadow-ai" />
            <KPICard label="Governed" value={sa.converted} color="#22c55e" sub="Converted to use cases" href="/dashboard/control-graph/shadow-ai" />
          </div>
        </div>
      )}

      {priority.length > 0 && (
        <Card className="p-0 overflow-x-auto">
          <div className="px-5 pt-4">
            <CardLabel>High-Priority Use Cases</CardLabel>
          </div>
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="bg-[var(--panel)]">
                <th className="px-3.5 py-2.5 text-left text-[11px] font-medium uppercase text-[var(--faint)]">Use Case</th>
                <th className="px-3.5 py-2.5 text-left text-[11px] font-medium uppercase text-[var(--faint)]">Patterns</th>
                <th className="px-3.5 py-2.5 text-left text-[11px] font-medium uppercase text-[var(--faint)]">Tier</th>
                <th className="px-3.5 py-2.5 text-left text-[11px] font-medium uppercase text-[var(--faint)]">Decision</th>
              </tr>
            </thead>
            <tbody>
              {priority.map((uc) => (
                <tr key={uc.id} className="border-b border-[var(--surface-2)] hover:bg-[var(--border)]">
                  <td className="px-3.5 py-2.5 font-medium">
                    <Link href={`/dashboard/use-cases/${uc.id}`}>{uc.name}</Link>
                  </td>
                  <td className="px-3.5 py-2.5 text-[var(--muted)]">{(uc.patterns ?? []).slice(0, 3).join(" / ")}</td>
                  <td className="px-3.5 py-2.5">{uc.tier ? <TierBadge tier={uc.tier} /> : "—"}</td>
                  <td className="px-3.5 py-2.5">
                    {latestRec.has(uc.id) ? <RecBadge rec={latestRec.get(uc.id)!} /> : <span className="text-[var(--faint)]">In assessment</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {total === 0 && (
        <Card>
          <p className="text-sm text-[var(--muted)]">
            No use cases yet —{" "}
            <Link href="/dashboard/use-cases/new" className="text-[#3b82f6] underline">
              onboard your first AI use case
            </Link>{" "}
            to start the assessment workflow.
          </p>
        </Card>
      )}
    </div>
  );
}
