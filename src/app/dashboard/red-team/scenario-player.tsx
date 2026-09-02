"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RedTeamPath } from "@/lib/red-team-v2";

/** One graphical scenario player for a use case's Red Team.
 *  Verdict row → scenario menu → animated kill-chain (auto-plays the scariest) →
 *  outcome + fastest fix → collapsible "under the hood". Replaces the old stacked
 *  path-list + findings-panel wall. A node goes green only where a VERIFIED control
 *  breaks the chain (proof, not paperwork). */

const IMPACT_C: Record<string, string> = { critical: "#ef4444", high: "#f97316", moderate: "#f59e0b", low: "#22c55e" };
const RANK: Record<string, number> = { critical: 4, high: 3, moderate: 2, low: 1 };
const reachesObjective = (p: RedTeamPath) => p.edges.findIndex((e) => e.residual === "blocked") < 0;

/** Empirical stamp for a path from the latest Live Fire run, matched by OWASP ref.
 *  confirmed → exploited live · blocked → attempted, held · else not yet tested. */
const STAMP: Record<string, { label: string; c: string }> = {
  confirmed: { label: "Exploited live", c: "#ef4444" },
  blocked: { label: "Attempted, held", c: "#22c55e" },
  inconclusive: { label: "Tested, inconclusive", c: "#f59e0b" },
};
function liveStampFor(p: RedTeamPath, stamps: Record<string, string>): { label: string; c: string } | null {
  for (const o of p.owasp ?? []) { const v = stamps[o]; if (v && STAMP[v]) return STAMP[v]; }
  return null;
}

export default function RedTeamScenarioPlayer({ paths, liveStamps = {}, liveRunAt = null }: { paths: RedTeamPath[]; liveStamps?: Record<string, string>; liveRunAt?: string | null }) {
  const sorted = useMemo(
    () => [...paths].sort((a, b) => (Number(reachesObjective(b)) - Number(reachesObjective(a))) || ((RANK[b.impact] ?? 0) - (RANK[a.impact] ?? 0))),
    [paths],
  );
  const [sel, setSel] = useState(0);
  const [step, setStep] = useState(99);        // nodes revealed; 99 = all shown
  const [showDetail, setShowDetail] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const path = sorted[sel] ?? null;

  const summary = useMemo(() => {
    let impact = 0, blocked = 0;
    for (const p of sorted) reachesObjective(p) ? impact++ : blocked++;
    return { total: sorted.length, impact, blocked };
  }, [sorted]);

  const stopEdgeIdx = path ? path.edges.findIndex((e) => e.residual === "blocked") : -1;
  const stopNodeIdx = useMemo(() => {
    if (!path || stopEdgeIdx < 0) return -1;
    const toId = path.edges[stopEdgeIdx].to;
    return path.nodes.findIndex((n) => n.id === toId);
  }, [path, stopEdgeIdx]);

  function play() {
    if (!path) return;
    if (timer.current) clearInterval(timer.current);
    setStep(0);
    const max = path.nodes.length;
    timer.current = setInterval(() => {
      setStep((s) => {
        if (s >= max) { if (timer.current) clearInterval(timer.current); return 99; }
        return s + 1;
      });
    }, 620);
  }

  // auto-play the scariest on load, and whenever the selected scenario changes
  useEffect(() => { play(); return () => { if (timer.current) clearInterval(timer.current); }; /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [sel]);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  if (!paths.length) {
    return <p className="text-[13px] text-[var(--muted)]">No attack scenarios yet — run the assessment (and Red Team) first, then the scenarios appear here.</p>;
  }

  const nodeRole = (i: number): "attacked" | "broken" | "unreached" => {
    if (stopNodeIdx < 0) return "attacked";
    if (i < stopNodeIdx) return "attacked";
    if (i === stopNodeIdx) return "broken";
    return "unreached";
  };
  const shown = (i: number) => step === 99 || i < step;

  return (
    <div className="flex flex-col gap-4">
      {/* verdict row */}
      <div>
        <div className="flex items-baseline gap-2.5">
          <span className="text-[15px] font-semibold text-[var(--text)]">Adversary scenarios</span>
          <span className="text-[12.5px] text-[var(--muted)]">{summary.total} scenarios · <span style={{ color: "#ef4444" }}>{summary.impact} reach impact</span> · <span style={{ color: "#22c55e" }}>{summary.blocked} broken by a verified control</span></span>
        </div>
        {liveRunAt ? (
          <p className="mt-0.5 text-[11.5px] text-[var(--faint)]">Live Fire ran {new Date(liveRunAt).toLocaleDateString()} — scenarios below carry the empirical stamp of what actually broke. <a href="/dashboard/red-team" className="text-[#3b82f6] hover:underline">Run again</a></p>
        ) : (
          <p className="mt-0.5 text-[11.5px] text-[var(--faint)]">Map only — no live proof yet. <a href="/dashboard/red-team" className="text-[#3b82f6] hover:underline">Run Live Fire</a> to attack this AI and stamp what actually breaks.</p>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[
          { v: summary.impact, l: "Reach impact", c: "#ef4444" },
          { v: summary.blocked, l: "Broken by control", c: "#22c55e" },
          { v: summary.total, l: "Scenarios", c: "var(--text)" },
        ].map((k) => (
          <div key={k.l} className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-3.5">
            <div className="text-[22px] font-bold" style={{ color: k.c }}>{k.v}</div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--faint)]">{k.l}</div>
          </div>
        ))}
      </div>

      {/* scenario menu */}
      <div className="flex flex-col gap-2">
        {sorted.map((p, i) => {
          const reaches = reachesObjective(p);
          const dot = reaches ? "#ef4444" : "#22c55e";
          const on = i === sel;
          return (
            <button key={p.id} onClick={() => { setSel(i); setShowDetail(false); }}
              className="flex items-center gap-2.5 rounded-[10px] border px-3 py-2.5 text-left transition"
              style={{ borderColor: on ? "#3b82f6" : "var(--border)", borderWidth: on ? 2 : 1, background: "var(--surface)" }}>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dot }} />
              <span className="flex-1 text-[13.5px] font-semibold text-[var(--text)]">{p.title}</span>
              {(() => { const s = liveStampFor(p, liveStamps); return s ? <span className="rounded px-2 py-0.5 text-[10px] font-bold uppercase" style={{ color: s.c, background: `${s.c}1f`, border: `1px solid ${s.c}44` }}>● {s.label}</span> : null; })()}
              {(p.owasp ?? []).slice(0, 1).map((o) => <span key={o} className="hidden sm:inline text-[10px] font-mono text-[var(--faint)]">{o}</span>)}
              <span className="rounded px-2 py-0.5 text-[10.5px] font-bold uppercase" style={{ color: IMPACT_C[p.impact] ?? "#f59e0b", background: `${IMPACT_C[p.impact] ?? "#f59e0b"}1f` }}>{p.impact}</span>
            </button>
          );
        })}
      </div>

      {/* the player */}
      {path && (
        <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold text-[var(--text)]">{path.title}</span>
            {(path.owasp ?? []).slice(0, 2).map((o) => <span key={o} className="rounded px-1.5 py-0.5 text-[10px] font-mono" style={{ color: "#818cf8", background: "#818cf81a", border: "1px solid #818cf844" }}>{o}</span>)}
            {(path.atlas ?? []).slice(0, 1).map((a) => <span key={a} className="rounded px-1.5 py-0.5 text-[10px] font-mono" style={{ color: "#f59e0b", background: "#f59e0b1a", border: "1px solid #f59e0b44" }}>{a}</span>)}
            <button onClick={play} className="ml-auto rounded-md border border-[var(--border)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text)] hover:bg-[var(--panel)]">▶ Replay</button>
          </div>

          {/* kill-chain */}
          <div className="mt-4 flex items-stretch gap-1.5 overflow-x-auto pb-1">
            {path.nodes.map((n, i) => {
              const role = nodeRole(i);
              const c = role === "broken" ? "#22c55e" : role === "attacked" ? "#ef4444" : "var(--faint)";
              const bg = role === "broken" ? "#22c55e14" : role === "attacked" ? "#e5484d12" : "transparent";
              const bd = role === "broken" ? "#22c55e55" : role === "attacked" ? "#e5484d44" : "var(--border)";
              const label = i > 0 ? path.edges[i - 1]?.label ?? "" : "entry point";
              return (
                <div key={n.id} className="flex items-stretch gap-1.5" style={{ opacity: shown(i) ? 1 : 0.12, transition: "opacity .35s" }}>
                  <div className="flex min-w-[120px] flex-1 flex-col justify-center rounded-[10px] border p-2.5 text-center" style={{ background: bg, borderColor: bd }}>
                    <div className="text-[12px] font-semibold" style={{ color: role === "unreached" ? "var(--faint)" : "var(--text)" }}>
                      {role === "broken" ? "⛔ " : ""}{n.name}
                    </div>
                    <div className="mt-0.5 text-[10px]" style={{ color: role === "broken" ? "#16a34a" : role === "attacked" ? "#fca5a5" : "var(--faint)" }}>{label}</div>
                  </div>
                  {i < path.nodes.length - 1 && <span className="self-center" style={{ color: c }}>→</span>}
                </div>
              );
            })}
          </div>

          {/* outcome */}
          <div className="mt-4 rounded-[10px] p-3.5" style={stopNodeIdx < 0
            ? { border: "1px solid #e5484d55", background: "#e5484d10" }
            : { border: "1px solid #22c55e55", background: "#22c55e12" }}>
            {stopNodeIdx < 0 ? (
              <>
                <div className="text-[13.5px] font-bold text-[#ef4444]">Reaches the objective: {path.objective}.</div>
                <p className="mt-1 text-[12.5px] text-[var(--text)]">{path.residual?.label ?? "Unmitigated"}. Nothing verified stops this yet.</p>
                {path.recommendation && <p className="mt-1 text-[12px] text-[var(--muted)]"><b className="text-[var(--text)]">Fastest fix:</b> {path.recommendation}</p>}
              </>
            ) : (
              <>
                <div className="text-[13.5px] font-bold text-[#16a34a]">Broken at &ldquo;{path.nodes[stopNodeIdx]?.name}&rdquo; by a verified control.</div>
                <p className="mt-1 text-[12.5px] text-[var(--text)]">The chain dies before the objective. A step only goes green when the breaking control is actually verified.</p>
              </>
            )}
          </div>

          {/* under the hood */}
          <button onClick={() => setShowDetail((v) => !v)} className="mt-3 text-[12px] font-semibold text-[var(--muted)] hover:text-[var(--text)]">
            {showDetail ? "▴ Hide" : "▾ Under the hood"} — steps, controls &amp; mapping
          </button>
          {showDetail && (
            <div className="mt-2 flex flex-col gap-1.5">
              {path.whyApplies && <p className="text-[12px] text-[var(--muted)]"><b className="text-[var(--text)]">Why it applies:</b> {path.whyApplies}</p>}
              {path.attackerGets && <p className="text-[12px] text-[var(--muted)]"><b className="text-[var(--text)]">Attacker gets:</b> {path.attackerGets}</p>}
              {path.edges.map((e, i) => {
                const breaker = e.controls.find((c) => c.effect === "breaks" && c.status === "verified") ?? e.controls.find((c) => c.status === "verified") ?? e.controls[0];
                return (
                  <div key={i} className="rounded-[8px] border border-[var(--border)] bg-[var(--panel)] p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-semibold text-[var(--text)]">{i + 1}. {e.label}</span>
                      <span className="text-[11px] font-bold" style={{ color: e.residual === "blocked" ? "#16a34a" : e.residual === "open" ? "#ef4444" : "#f59e0b" }}>{e.residual}</span>
                    </div>
                    {breaker && <p className="mt-0.5 text-[11px] text-[var(--faint)]">{e.residual === "blocked" ? "Broken by" : "Would be broken by"}: {breaker.label} ({breaker.status})</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      <p className="text-[11px] text-[var(--muted)]">Grounded on this AI&apos;s real authority graph and control status · mapped to OWASP LLM &amp; MITRE ATLAS · a step blocks only when the breaking control is verified.</p>
    </div>
  );
}
