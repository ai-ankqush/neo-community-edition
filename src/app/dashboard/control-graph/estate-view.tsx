"use client";
import { BRAND } from "@/lib/brand";

/** The AI Estate — one architecture, many Perspectives. Story leads (Neo narrating
 *  the whole estate); the other lenses reslice the same use cases. "Lenses, not filters."
 *  Replaces the old node-link estate graph. Theme-safe: colour tints work in light + dark. */

import { useState, useEffect } from "react";
import Link from "next/link";
import type { ControlGraph, CGUseCase } from "@/lib/control-graph";
import { CG_LENSES } from "@/lib/control-graph";
import { buildEstateInsights } from "@/lib/estate-insights";
import type { ControlPicture, VerdictState } from "@/lib/control-picture";
import StoryFlow from "@/components/console/story-flow";

type Pic = { id: string; name: string; tier: number | null; picture: ControlPicture };

const VERDICT_C: Record<VerdictState, string> = {
  ready: "#22c55e", conditions: "#3b82f6", not_ready: "#ef4444", needs_decision: "#f59e0b", in_progress: "#8892a4",
};
const SEV_C: Record<string, string> = { high: "#ef4444", medium: "#f59e0b", low: "#3b82f6" };
const tierColor = (t: number | null) =>
  (t ?? 0) >= 4 ? "#ef4444" : (t ?? 0) === 3 ? "#f59e0b" : (t ?? 0) >= 1 ? "#22c55e" : "#8892a4";

const VIEWS = [
  { key: "story", label: "Story" },
  { key: "risk", label: "Use Cases" },
  { key: "sensitive", label: "Sensitive Data" },
  { key: "controls", label: "Missing Controls" },
  { key: "decisions", label: "Decisions" },
  { key: "blast", label: "Blast Radius" },
];
// view → the CG lens that filters the use cases
const LENS_FOR: Record<string, string> = { sensitive: "sensitive", controls: "gaps", decisions: "high_no_decision" };

export default function EstateView({ graph, pics, showSupplyChain = false }: { graph: ControlGraph; pics: Pic[]; showSupplyChain?: boolean }) {
  const [view, setView] = useState("story");
  // Drill into the richer per-use-case zoom (What it can See/Decide/Do/Remember/Learn/Expose,
  // dependencies, verdict) when Supply Chain is available; else the plain use-case detail.
  const ucHref = (id: string) => (showSupplyChain ? `/dashboard/supply-chain?uc=${id}` : `/dashboard/use-cases/${id}`);
  // Story Mode — Neo narrates the estate (generated, grounded); falls back to the
  // deterministic summary while loading or if the call fails.
  const [steps, setSteps] = useState<string[]>([]);
  const [residual, setResidual] = useState<string | null>(null);
  const [storyLoading, setStoryLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    fetch("/api/estate-story")
      .then((r) => r.json())
      .then((d) => { if (alive) { setSteps(Array.isArray(d?.steps) ? d.steps : []); setResidual(typeof d?.residual === "string" ? d.residual : null); } })
      .catch(() => {})
      .finally(() => { if (alive) setStoryLoading(false); });
    return () => { alive = false; };
  }, []);
  // Per-use-case Story — clicking a use case pops its radiology-report flow open, inline.
  const [openUc, setOpenUc] = useState<string | null>(null);
  const [ucSteps, setUcSteps] = useState<string[]>([]);
  const [ucResidual, setUcResidual] = useState<string | null>(null);
  const [ucLoading, setUcLoading] = useState(false);
  function toggleUc(id: string) {
    if (openUc === id) { setOpenUc(null); return; }
    setOpenUc(id); setUcLoading(true); setUcSteps([]); setUcResidual(null);
    fetch(`/api/use-case-story?uc=${id}`)
      .then((r) => r.json())
      .then((d) => { setUcSteps(Array.isArray(d?.steps) ? d.steps : []); setUcResidual(typeof d?.residual === "string" ? d.residual : null); })
      .catch(() => {})
      .finally(() => setUcLoading(false));
  }
  const picById = new Map(pics.map((p) => [p.id, p]));
  const insights = buildEstateInsights(graph);
  const total = graph.useCases.length;
  const stateIn = (arr: VerdictState[]) => pics.filter((p) => arr.includes(p.picture.verdict.state)).length;
  const boardReady = stateIn(["ready", "conditions"]);
  const needWork = stateIn(["not_ready", "needs_decision"]);

  function Row({ u }: { u: CGUseCase }) {
    const v = picById.get(u.id)?.picture.verdict;
    const vc = v ? VERDICT_C[v.state] : "#8892a4";
    const open = openUc === u.id;
    return (
      <div>
        <button onClick={() => toggleUc(u.id)}
          className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] transition-colors hover:bg-[var(--border)]">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: tierColor(u.tier) }} />
          <span className="min-w-0 flex-1 truncate text-[var(--text)]"><span className="font-medium">{u.name}</span>{u.tier ? <span className="text-[var(--faint)]"> · Tier {u.tier}</span> : null}</span>
          {v && <span className="shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold" style={{ background: `${vc}1f`, color: vc }}>{v.headline}</span>}
          <span className="shrink-0 rounded-md border border-[#3b82f6]/40 bg-[#3b82f6]/10 px-2.5 py-1 text-[11px] font-semibold text-[#3b82f6]">{open ? "Hide" : "▸ Read story"}</span>
        </button>
        {open && (
          <div className="border-t border-[var(--border)] bg-[var(--panel)] px-4 py-4">
            <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#3b82f6]">Through the lens of — the story</div>
            <StoryFlow steps={ucSteps} residual={ucResidual} loading={ucLoading} thinking={`${BRAND.name} is reading this system…`} />
            <div className="mt-3"><Link href={ucHref(u.id)} className="text-[12px] font-semibold text-[#3b82f6] hover:underline">Open full detail — See · Decide · Do · Remember · Learn · Expose →</Link></div>
          </div>
        )}
      </div>
    );
  }
  function List({ ucs, empty }: { ucs: CGUseCase[]; empty: string }) {
    if (!ucs.length) return <div className="rounded-[10px] border border-dashed border-[var(--border)] px-4 py-6 text-center text-[13px] text-[var(--muted)]">{empty}</div>;
    return <div className="divide-y divide-[var(--border)] overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface)]">{ucs.map((u) => <Row key={u.id} u={u} />)}</div>;
  }

  const body = (() => {
    if (view === "story") {
      const top = insights[0];
      return (
        <div>
          <div className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#3b82f6]">Through the lens of — the story</div>
          {storyLoading ? (
            <StoryFlow steps={[]} loading thinking={`${BRAND.name} is reading your estate…`} />
          ) : steps.length > 0 ? (
            <StoryFlow steps={steps} residual={residual} />
          ) : (
            <p className="max-w-2xl text-[15px] font-medium leading-relaxed text-[var(--text)]">
              You have {total} AI use case{total === 1 ? "" : "s"} — <span style={{ color: "#22c55e" }}>{boardReady} board-ready</span>, <span style={{ color: "#f59e0b" }}>{needWork} need work</span>{graph.summary.highRiskNoDecision > 0 ? <>, and <span style={{ color: "#ef4444" }}>{graph.summary.highRiskNoDecision} high-risk without sign-off</span></> : null}.
            </p>
          )}
          {insights.length > 0 && (
            <div className="mt-6 flex flex-col gap-2">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[var(--faint)]">What stands out</div>
              {insights.map((ins) => {
                const c = SEV_C[ins.severity];
                const jump = ins.action.kind === "lens" ? Object.keys(LENS_FOR).find((k) => LENS_FOR[k] === (ins.action as { lens: string }).lens) : null;
                return (
                  <div key={ins.key} className="flex items-start gap-2.5 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5" style={{ borderLeft: `3px solid ${c}` }}>
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: c }} />
                    <span className="min-w-0 flex-1 text-[13px] leading-relaxed text-[var(--text)]">{ins.text}</span>
                    {jump && <button onClick={() => setView(jump)} className="shrink-0 text-[11.5px] font-semibold text-[#3b82f6] hover:underline">See →</button>}
                  </div>
                );
              })}
            </div>
          )}
          {steps.length === 0 && top && (
            <div className="mt-4 max-w-2xl rounded-r-[8px] border-l-[3px] border-[#ef4444] bg-[#ef444410] px-4 py-3">
              <span className="text-[10px] font-bold uppercase tracking-wide text-[#ef4444]">Greatest residual risk across the estate</span>
              <p className="mt-1 text-[14px] leading-relaxed text-[var(--text)]">{top.text}</p>
            </div>
          )}
          <p className="mt-4 text-[11px] text-[var(--faint)]">{steps.length > 0 ? `Written by ${BRAND.name}, grounded in the signals below — no facts beyond your estate.` : "Summarised from your estate — verdicts, concentration and blast radius."}</p>

          {graph.useCases.length > 0 && (
            <button onClick={() => setView("risk")} className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-[#3b82f6]/40 bg-[#3b82f6]/10 px-3 py-1.5 text-[12px] font-semibold text-[#3b82f6]">
              Read any system&apos;s story →
            </button>
          )}
        </div>
      );
    }
    if (view === "risk") {
      const sorted = [...graph.useCases].sort((a, b) => (b.tier ?? 0) - (a.tier ?? 0));
      return <List ucs={sorted} empty="No use cases yet." />;
    }
    if (view === "blast") {
      const shared = graph.entities.filter((e) => e.useCaseIds.length >= 2).sort((a, b) => b.useCaseIds.length - a.useCaseIds.length);
      if (!shared.length) return <div className="rounded-[10px] border border-dashed border-[var(--border)] px-4 py-6 text-center text-[13px] text-[var(--muted)]">Nothing is shared across two or more use cases yet — no concentration to worry about.</div>;
      return (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-[var(--muted)]">What&apos;s shared across your estate — if one of these fails or is compromised, everything on it is hit.</p>
          {shared.map((e) => {
            const hit = e.useCaseIds.length, p = total ? Math.round((hit / total) * 100) : 0;
            const c = p >= 50 ? "#ef4444" : p >= 33 ? "#f59e0b" : "#3b82f6";
            return (
              <div key={e.key} className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-4 py-3" style={{ borderLeft: `3px solid ${c}` }}>
                <div className="flex items-center gap-2"><span className="text-[13.5px] font-semibold text-[var(--text)]">{e.name}</span><span className="ml-auto rounded px-2 py-0.5 text-[11px] font-bold" style={{ background: `${c}1f`, color: c }}>{hit} of {total} · {p}%</span></div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {e.useCaseIds.map((id) => { const u = graph.useCases.find((x) => x.id === id); return u ? <Link key={id} href={ucHref(id)} className="rounded border border-[var(--border)] bg-[var(--panel)] px-2 py-0.5 text-[11px] text-[var(--text)] hover:border-[#3b82f660]">{u.name}</Link> : null; })}
                </div>
              </div>
            );
          })}
        </div>
      );
    }
    // filtered lenses (sensitive / controls / decisions)
    const lensKey = LENS_FOR[view];
    const match = CG_LENSES.find((l) => l.key === lensKey)?.match ?? (() => false);
    const ucs = graph.useCases.filter(match);
    const empties: Record<string, string> = {
      sensitive: "No use case accesses sensitive data.",
      controls: "No control gaps — every use case has its required controls in place.",
      decisions: "No high-risk use case is missing a decision. Nicely governed.",
    };
    return <List ucs={ucs} empty={empties[view] ?? "Nothing matches this lens."} />;
  })();

  return (
    <div className="w-full">
      <div className="mb-1 flex items-center gap-2.5">
        <h1 className="text-[19px] font-bold text-[var(--text)]">Your AI estate</h1>
        <span className="ml-auto text-[12px] text-[var(--faint)]">{total} use case{total === 1 ? "" : "s"}</span>
      </div>
      <p className="mb-4 text-[12px] text-[var(--faint)]">One estate. Switch the perspective — the whole view transforms.</p>

      <div className="flex flex-wrap gap-1.5 border-b border-[var(--border)] pb-4">
        {VIEWS.map((v) => {
          const on = view === v.key;
          return (
            <button key={v.key} onClick={() => setView(v.key)}
              className={`rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition-colors ${on ? "border-[#3b82f6] bg-[#3b82f614] text-[#3b82f6]" : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"}`}>
              {v.label}
            </button>
          );
        })}
      </div>

      <div className="pt-6">{body}</div>
    </div>
  );
}
