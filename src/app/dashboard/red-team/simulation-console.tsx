"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Simulation — command-bar twin of Live Fire. Pick a use case, pick one of the
 * scenarios Red Team discovered for it, play. Replays the discovered attack chain
 * on the graph (no traffic) and stops green where a verified control breaks it.
 */

export type SimScenario = {
  id: string; title: string; vector: string; severity: string;
  owasp: string | null; atlas: string | null;
  steps: { name: string; label: string }[];
  breakAt: number;            // node index broken by a verified control, or -1
  objective: string; fix: string; status: string; detail?: string;
};

const SEV_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const SEV_C: Record<string, string> = { critical: "#ef4444", high: "#f97316", medium: "#f59e0b", low: "#22c55e" };
const STAMP: Record<string, { t: string; c: string }> = { confirmed: { t: "exploited live", c: "#ef4444" }, blocked: { t: "held live", c: "#22c55e" }, inconclusive: { t: "tested", c: "#f59e0b" } };

export default function SimulationConsole({
  useCases, selectedUc, scenarios, liveStamps = {},
}: {
  useCases: { id: string; name: string }[];
  selectedUc: string | null;
  scenarios: SimScenario[];
  liveStamps?: Record<string, string>;
}) {
  const router = useRouter();
  const sorted = useMemo(
    () => [...scenarios].sort((a, b) => (a.breakAt < 0 === (b.breakAt < 0) ? 0 : a.breakAt < 0 ? -1 : 1) || ((SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9))),
    [scenarios],
  );
  const [sel, setSel] = useState(0);
  const [step, setStep] = useState(99);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const s = sorted[sel] ?? null;

  function play() {
    if (!s) return;
    if (timer.current) clearInterval(timer.current);
    setStep(0);
    const max = s.steps.length;
    timer.current = setInterval(() => {
      setStep((v) => { if (v >= max) { if (timer.current) clearInterval(timer.current); return 99; } return v + 1; });
    }, 480);
  }
  useEffect(() => { play(); return () => { if (timer.current) clearInterval(timer.current); }; /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [sel, selectedUc]);

  const field = "rounded-md border border-[var(--border)] bg-[var(--panel)] px-2.5 py-2 text-[12.5px] text-[var(--text)] outline-none focus:border-[#3b82f6]";
  const shown = (i: number) => step === 99 || i < step;
  const stamp = s ? (s.owasp ? liveStamps[s.owasp] : null) : null;

  return (
    <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-4">
      {/* command bar */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full bg-[#a855f7]" />
        <span className="text-[13px] font-semibold text-[var(--text)]">Simulation</span>
        <select value={selectedUc ?? ""} onChange={(e) => router.push(`/dashboard/red-team?view=sim${e.target.value ? `&uc=${e.target.value}` : ""}`)} className={`${field} min-w-[150px] flex-1`}>
          {useCases.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select value={sel} onChange={(e) => setSel(Number(e.target.value))} disabled={!sorted.length} className={`${field} min-w-[150px] flex-1`}>
          {sorted.length === 0 && <option>No scenarios</option>}
          {sorted.map((sc, i) => <option key={sc.id} value={i}>{sc.vector} · {sc.title}</option>)}
        </select>
        <button onClick={play} disabled={!s} className="rounded-md bg-[#a855f7] px-4 py-2 text-[12.5px] font-bold text-white transition hover:bg-[#9333ea] disabled:opacity-50">Play</button>
      </div>

      {sorted.length > 0 && <p className="mt-2 text-[11.5px] text-[var(--faint)]">{sorted.length} scenario{sorted.length === 1 ? "" : "s"} discovered for this use case</p>}

      {!s ? (
        <p className="mt-3 text-[12.5px] text-[var(--muted)]">No scenarios for this use case yet. Open its <b>Red Team</b> tab and run the engine, then replay them here.</p>
      ) : (
        <>
          {/* kill-chain */}
          <div className="mt-4 flex items-stretch gap-1.5 overflow-x-auto pb-1">
            {s.steps.map((n, i) => {
              const role = s.breakAt < 0 ? "attacked" : i < s.breakAt ? "attacked" : i === s.breakAt ? "broken" : "unreached";
              const c = role === "broken" ? "#22c55e" : role === "attacked" ? "#ef4444" : "var(--faint)";
              const bg = role === "broken" ? "#22c55e14" : role === "attacked" ? "#e5484d12" : "transparent";
              const bd = role === "broken" ? "#22c55e55" : role === "attacked" ? "#e5484d44" : "var(--border)";
              return (
                <div key={i} className="flex items-stretch gap-1.5" style={{ opacity: shown(i) ? 1 : 0.12, transition: "opacity .35s" }}>
                  <div className="flex min-w-[112px] flex-1 flex-col justify-center rounded-[10px] border p-2.5 text-center" style={{ background: bg, borderColor: bd }}>
                    <div className="text-[12px] font-semibold" style={{ color: role === "unreached" ? "var(--faint)" : "var(--text)" }}>{role === "broken" ? "⛔ " : ""}{n.name}</div>
                    <div className="mt-0.5 text-[10px]" style={{ color: role === "broken" ? "#16a34a" : role === "attacked" ? "#fca5a5" : "var(--faint)" }}>{n.label}</div>
                  </div>
                  {i < s.steps.length - 1 && <span className="self-center" style={{ color: c }}>→</span>}
                </div>
              );
            })}
          </div>

          {/* result */}
          <div className="mt-3 rounded-[10px] p-3" style={s.breakAt < 0 ? { border: "1px solid #e5484d55", background: "#e5484d10" } : { border: "1px solid #22c55e55", background: "#22c55e12" }}>
            {s.breakAt < 0 ? (
              <>
                <div className="text-[13px] font-bold text-[#ef4444]">Reaches the objective: {s.objective}.</div>
                <p className="mt-1 text-[12px] text-[var(--muted)]"><b className="text-[var(--text)]">Fix</b> · {s.fix}</p>
              </>
            ) : (
              <div className="text-[13px] font-bold text-[#16a34a]">Broken at &ldquo;{s.steps[s.breakAt]?.name}&rdquo; — the control holds.</div>
            )}
            {s.detail && <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--faint)]">{s.detail}</p>}
          </div>

          <p className="mt-2 flex items-center gap-2 text-[11px] text-[var(--faint)]">
            <span className="rounded px-1.5 py-0.5 font-bold uppercase" style={{ color: SEV_C[s.severity] ?? "#6b7280", background: `${SEV_C[s.severity] ?? "#6b7280"}1f` }}>{s.severity}</span>
            {s.owasp && <span className="font-mono">{s.owasp}{s.atlas ? ` · ${s.atlas}` : ""}</span>}
            {stamp && STAMP[stamp] && <span style={{ color: STAMP[stamp].c }}>● {STAMP[stamp].t}</span>}
          </p>
        </>
      )}
    </div>
  );
}
