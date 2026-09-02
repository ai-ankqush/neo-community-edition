import Link from "next/link";
import { portfolioContext } from "@/lib/portfolio";
import { supabaseAdmin } from "@/lib/supabase";
import { planFor } from "@/lib/plans";
import { Card } from "@/components/console/ui";
import { loadLatestRun } from "@/server/red-team/load";
import LiveFireConsole from "./live-fire-console";
import SimulationConsole, { type SimScenario } from "./simulation-console";
import { BRAND } from "@/lib/brand";
import { communityActive } from "@/ce/server";

const VEC: Record<string, string> = { see: "SEE", decide: "DECIDE", do: "DO" };

export const dynamic = "force-dynamic";

/** Red Team console — THE ACTION. Two tabs: Live Fire (attack a connected AI live)
 *  and Simulation (replay the grounded attack scenarios). Findings live on each use
 *  case's own Red Team tab. */
export default async function RedTeamConsole({ searchParams }: { searchParams: Promise<{ uc?: string; view?: string }> }) {
  const sp = await searchParams;
  const ctx = await portfolioContext();
  if (!ctx) return <p className="text-[var(--muted)]">Select an organization first.</p>;
  const sb = supabaseAdmin();

  const { data: org } = await sb.from("organizations").select("plan").eq("id", ctx.internalOrgId).single();
  const plan = planFor(org?.plan);
  const community = await communityActive();

  // Live Fire integration gate: an endpoint / MCP target needs a real connection.
  // Public (open to the world) and Sandbox are exempt.
  const { count: connCount } = await sb.from("org_connections").select("*", { count: "exact", head: true }).eq("org_id", ctx.internalOrgId).eq("status", "connected");
  const hasIntegration = (connCount ?? 0) > 0;

  if (!plan.redTeam && !community) {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h2 className="text-xl font-bold">Red Team</h2>
          <p className="mt-1 text-[13px] text-[var(--faint)]">Attack your AI live — and see exactly what breaks.</p>
        </div>
        <Card accent="#ef4444">
          <h3 className="text-sm font-semibold text-[var(--text)]">Red Team is an Enterprise feature</h3>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-[var(--muted)]">
            {BRAND.name} Red Team attacks your AI with judgement — it picks the attacks that matter for this specific AI,
            proves what actually breaks, and closes each to a verified control. Not agentic brute force: decision and judgement.
          </p>
          <div className="mt-3 flex gap-2">
            <Link href="/dashboard/plans" className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)] hover:border-[#3b82f660] hover:text-[#3b82f6]">View plans</Link>
            <a href={`mailto:${BRAND.contactEmail}?subject=${BRAND.name}%20Red%20Team`} className="rounded-md bg-[#3b82f6] px-3 py-1.5 text-xs font-semibold text-white">Talk to us</a>
          </div>
        </Card>
      </div>
    );
  }

  const view = sp.view === "sim" ? "sim" : "live";
  const consoleUseCases = Array.from(ctx.ucMap.entries())
    .map(([id, v]) => ({ id, name: v.name ?? "—" }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const selectedUc = sp.uc && ctx.ucMap.has(sp.uc) ? sp.uc : (consoleUseCases[0]?.id ?? null);

  // Simulation replays the SAME scenarios Red Team discovered for the use case
  // (its red_team_findings) — the exact set shown on the use case's Red Team tab.
  let scenarios: SimScenario[] = [];
  let liveStamps: Record<string, string> = {};
  if (view === "sim" && selectedUc) {
    try {
      const [{ data: findings }, latest] = await Promise.all([
        sb.from("red_team_findings")
          .select("id, vector, technique, scenario, unguarded_outcome, severity, owasp_ref, atlas_ref, blocking_pillar, blocking_control, exposure")
          .eq("org_id", ctx.internalOrgId).eq("use_case_id", selectedUc),
        loadLatestRun(ctx.internalOrgId, selectedUc),
      ]);
      liveStamps = latest.byOwasp;
      scenarios = (findings ?? []).map((f): SimScenario => {
        const vec = VEC[f.vector as string] ?? String(f.vector).toUpperCase();
        const fix = `P${f.blocking_pillar ?? "?"}: ${f.blocking_control ?? "control"}`;
        const blocked = f.exposure === "blocked";
        return {
          id: String(f.id), title: f.technique as string, vector: vec, severity: f.severity as string,
          owasp: (f.owasp_ref as string) ?? null, atlas: (f.atlas_ref as string) ?? null,
          steps: [
            { name: vec, label: "entry" },
            { name: f.technique as string, label: "attack" },
            { name: fix, label: "control" },
            { name: (f.unguarded_outcome as string) || "impact", label: blocked ? "stopped" : "impact" },
          ],
          breakAt: blocked ? 2 : -1,
          objective: (f.unguarded_outcome as string) || "the objective",
          fix, status: f.exposure as string, detail: (f.scenario as string) ?? undefined,
        };
      });
    } catch (e) { console.error("simulation scenarios load failed", e); }
  }

  const tabHref = (v: string) => {
    const p = new URLSearchParams();
    p.set("view", v);
    if (sp.uc) p.set("uc", sp.uc);
    return `/dashboard/red-team?${p.toString()}`;
  };
  const tabCls = (on: boolean) =>
    `border-b-2 px-1 pb-2 text-[13px] font-semibold transition ${on ? "border-[#ef4444] text-[var(--text)]" : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"}`;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold">Red Team</h2>
        <p className="mt-1 text-[13px] text-[var(--faint)]">Attack a connected AI live, or replay its attack scenarios.</p>
      </div>

      {community && (
        <Card accent="#f59e0b">
          <h3 className="text-sm font-semibold text-[var(--text)]">Red Team requires Anthropic cyber-verification approval</h3>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-[var(--muted)]">
            Red Team runs adversarial prompts against a live model. Anthropic gates offensive-security
            use behind its cyber-security verification program. Community Edition runs on your own key,
            so red-team runs may fail — or your API access may be suspended — unless your account is
            approved. Approved accounts can use this normally.
          </p>
        </Card>
      )}

      <div className="flex gap-5 border-b border-[var(--border)]">
        <Link href={tabHref("live")} className={tabCls(view === "live")}>Live Fire</Link>
        <Link href={tabHref("sim")} className={tabCls(view === "sim")}>Simulation</Link>
      </div>

      {view === "live" ? (
        <LiveFireConsole useCases={consoleUseCases} hasIntegration={hasIntegration} />
      ) : (
        <SimulationConsole useCases={consoleUseCases} selectedUc={selectedUc} scenarios={scenarios} liveStamps={liveStamps} />
      )}
    </div>
  );
}
