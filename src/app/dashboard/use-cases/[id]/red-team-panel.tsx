"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";

const RT_ACTIVITY = [
  "Reviewing the use case and its control posture…",
  "Building the attack paths — see / decide / do…",
  "Mapping each to OWASP LLM and MITRE ATLAS…",
  "Scoring exposure against your live controls…",
];

export interface RedTeamFinding {
  id: number;
  vector: string;
  technique: string;
  scenario: string;
  unguarded_outcome: string | null;
  severity: string;
  owasp_ref: string | null;
  atlas_ref: string | null;
  blocking_pillar: number | null;
  blocking_control: string | null;
  exposure: string;
}

const EXP = {
  exposed: { label: "EXPOSED", color: "#ef4444" },
  partial: { label: "PARTIAL", color: "#f59e0b" },
  blocked: { label: "BLOCKED", color: "#22c55e" },
} as const;
const SEV: Record<string, string> = { critical: "#ef4444", high: "#f97316", medium: "#f59e0b", low: "#22c55e" };
const VECTOR_LABEL: Record<string, string> = { see: "SEE", decide: "DECIDE", do: "DO" };

const SEV_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const STATUS: Record<string, { label: string; color: string }> = {
  exposed: { label: "Open", color: "#ef4444" },
  partial: { label: "Partial", color: "#f59e0b" },
  blocked: { label: "Addressed", color: "#22c55e" },
};

export default function RedTeamPanel({
  useCaseId,
  ucName = "",
  findings,
  canRun,
}: {
  useCaseId: string;
  ucName?: string;
  findings: RedTeamFinding[];
  canRun: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [actIdx, setActIdx] = useState(0);
  const [openF, setOpenF] = useState<Set<number>>(new Set());
  const toggleF = (id: number) => setOpenF((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setActIdx((i) => (i + 1) % RT_ACTIVITY.length), 3000);
    return () => clearInterval(t);
  }, [busy]);

  const pollJob = (jobId: string, started = Date.now()) => {
    const tick = async () => {
      try {
        const r = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        if (!r.ok) { setBusy(false); return; }
        const { job } = await r.json();
        if (job.status === "done") { setBusy(false); router.refresh(); }
        else if (job.status === "failed") { setErr(job.error ?? "Red Team failed"); setBusy(false); }
        else if (Date.now() - started > 6 * 60 * 1000) { setErr("Still running — the bell will notify you when it's ready."); setBusy(false); }
        else setTimeout(tick, 3000);
      } catch { setBusy(false); }
    };
    tick();
  };

  // reattach the progress UI + poller if a Red Team job is still running on return
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/jobs", { cache: "no-store" });
        if (!r.ok) return;
        const { jobs } = await r.json();
        const running = (jobs ?? []).find(
          (j: { use_case_id: string; stage: string; status: string; id: string }) =>
            j.use_case_id === useCaseId && j.stage === "red_team" && !["done", "failed"].includes(j.status)
        );
        if (running && !cancelled) { setBusy(true); setActIdx(0); pollJob(running.id); }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useCaseId]);

  async function run() {
    setBusy(true);
    setActIdx(0);
    setErr(null);
    try {
      const res = await fetch(`/api/use-cases/${useCaseId}/red-team`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Could not start");
      pollJob(json.jobId as string);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start");
      setBusy(false);
    }
  }

  const counts = {
    exposed: findings.filter((f) => f.exposure === "exposed").length,
    partial: findings.filter((f) => f.exposure === "partial").length,
    blocked: findings.filter((f) => f.exposure === "blocked").length,
  };
  // Worst severity first, then exposed before blocked — matches the portfolio table.
  const EXP_RANK: Record<string, number> = { exposed: 0, partial: 1, blocked: 2 };
  const sorted = [...findings].sort((a, b) =>
    (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9) || (EXP_RANK[a.exposure] ?? 9) - (EXP_RANK[b.exposure] ?? 9));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[13px] text-[var(--muted)]">
          Concrete attack paths for this use case, each scored against your current control posture.
          {findings.length === 0 && " Run Red Team to see where this use case is exposed today."}
        </p>
        {canRun && (
          <button
            onClick={run}
            disabled={busy}
            className="shrink-0 rounded-md border border-[#ef444466] px-3 py-1.5 text-xs font-semibold text-[#ef4444] hover:bg-[#ef44441a] disabled:opacity-50"
          >
            {busy ? "Running attack analysis…" : findings.length ? "↻ Re-run Red Team" : "▶ Run Red Team"}
          </button>
        )}
      </div>
      {err && <p className="text-[12px] text-red-500">{err}</p>}

      {busy && (
        <div className="rounded-lg border border-[#ef444440] bg-[#ef44440a] p-4">
          <div className="flex items-center gap-3">
            <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[#ef4444] border-t-transparent" />
            <span className="text-[13px] font-semibold text-[var(--text)]">{BRAND.name} Red Team is working…</span>
          </div>
          <p className="mt-2 text-[12.5px] text-[var(--muted)]">{RT_ACTIVITY[actIdx % RT_ACTIVITY.length]}</p>
          <p className="mt-2 text-[11px] text-[#4b5563]">Runs in the background — you can navigate away; it&apos;ll be here when you return.</p>
        </div>
      )}

      {findings.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Kpi label="Exposed" value={counts.exposed} color="#ef4444" />
            <Kpi label="Partial" value={counts.partial} color="#f59e0b" />
            <Kpi label="Blocked" value={counts.blocked} color="#22c55e" />
          </div>

          {/* Findings list — the consolidated Red Team table for this use case. */}
          <div className="overflow-x-auto rounded-[10px] border border-[var(--border)] bg-[var(--surface)]">
            <table className="w-full min-w-[720px]">
              <thead className="bg-[var(--panel)]">
                <tr>
                  <th className={TH}>Severity</th>
                  <th className={TH}>Use Case</th>
                  <th className={TH}>Vector</th>
                  <th className={TH}>Attack</th>
                  <th className={TH}>Fix (control)</th>
                  <th className={TH}>Status</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((f) => {
                  const st = STATUS[f.exposure] ?? STATUS.exposed;
                  const fOpen = openF.has(f.id);
                  return (
                    <FindingRows key={f.id} f={f} ucName={ucName} st={st} open={fOpen} onToggle={() => toggleF(f.id)} />
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

const TH = "px-3 py-2 text-left text-[11px] font-medium uppercase text-[var(--faint)]";
const TD = "px-3 py-2.5 align-top text-[12.5px]";

/** One finding = a clickable summary row + an expandable detail row (the attack path). */
function FindingRows({ f, ucName, st, open, onToggle }: { f: RedTeamFinding; ucName: string; st: { label: string; color: string }; open: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="cursor-pointer border-t border-[var(--row)] hover:bg-[var(--panel-hover)]" onClick={onToggle}>
        <td className={TD}>
          <span className="rounded px-2 py-0.5 text-[10px] font-bold capitalize" style={{ color: SEV[f.severity] ?? "#6b7280", background: `${SEV[f.severity] ?? "#6b7280"}1f` }}>{f.severity}</span>
        </td>
        <td className={`${TD} font-medium text-[var(--text)]`}>{ucName || "—"}</td>
        <td className={`${TD} text-[var(--muted)]`}>{VECTOR_LABEL[f.vector] ?? f.vector.toUpperCase()}</td>
        <td className={`${TD} text-[var(--text)]`}>
          <span className="w-3 pr-1 text-[12px] text-[var(--faint)]">{open ? "▾" : "▸"}</span>{f.technique}
        </td>
        <td className={`${TD} text-[var(--muted)]`}>P{f.blocking_pillar}: {f.blocking_control}</td>
        <td className={TD}>
          <span className="rounded px-2 py-0.5 text-[10px] font-bold" style={{ color: st.color, background: `${st.color}1f` }}>{st.label}</span>
        </td>
      </tr>
      {open && (
        <tr className="border-t border-[var(--row)] bg-[var(--panel)]">
          <td className={TD} colSpan={6}>
            <AttackPath f={f} />
            <p className="text-[12.5px] leading-relaxed text-[var(--text)]">{f.scenario}</p>
            {f.unguarded_outcome && (
              <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--muted)]"><span className="font-semibold text-[#ef4444]">Unguarded:</span> {f.unguarded_outcome}</p>
            )}
            {(f.owasp_ref || f.atlas_ref) && (
              <p className="mt-1.5 text-[10.5px] text-[var(--faint)]">
                {f.owasp_ref && <span>OWASP {f.owasp_ref}</span>}
                {f.owasp_ref && f.atlas_ref && <span> · </span>}
                {f.atlas_ref && <span>ATLAS {f.atlas_ref}</span>}
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

const CLAMP2 = { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" };

function PathNode({ title, sub, color, filled, muted }: { title: string; sub: string; color: string; filled?: boolean; muted?: boolean }) {
  if (filled) {
    return (
      <div className="min-w-[80px] flex-1 basis-[80px] rounded-md px-2.5 py-1.5" style={{ background: color }}>
        <div className="text-[11px] font-bold leading-snug text-white" style={CLAMP2} title={title}>{title}</div>
        <div className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-white/70">{sub}</div>
      </div>
    );
  }
  return (
    <div className="min-w-[80px] flex-1 basis-[80px] rounded-md px-2.5 py-1.5" style={{ background: muted ? "var(--panel)" : `${color}14`, border: `1px solid ${muted ? "var(--border)" : `${color}55`}` }}>
      <div className="text-[11px] font-bold leading-snug" style={{ ...CLAMP2, color: muted ? "var(--faint)" : "var(--text)" }} title={title}>{title}</div>
      <div className="mt-0.5 text-[9px] font-bold uppercase tracking-wide" style={{ color: muted ? "var(--faint)" : color }}>{sub}</div>
    </div>
  );
}

/** The attack path: entry → technique → the control that should stop it → impact. */
function AttackPath({ f }: { f: RedTeamFinding }) {
  const exp = EXP[f.exposure as keyof typeof EXP] ?? EXP.exposed;
  const blocked = f.exposure === "blocked";
  const gate = blocked ? "✓" : f.exposure === "partial" ? "~" : "✗";
  const arrow = (dashed: boolean) => (
    <span className="self-center text-[13px] font-bold" style={{ color: dashed ? "var(--faint)" : exp.color }}>{dashed ? "⇢" : "→"}</span>
  );
  return (
    <div className="mb-2.5 mt-2 flex flex-wrap items-stretch gap-1.5 rounded-md border border-[var(--border)] bg-[var(--panel)] p-2">
      <PathNode title={VECTOR_LABEL[f.vector] ?? f.vector.toUpperCase()} sub="entry" color={exp.color} />
      {arrow(false)}
      <PathNode title={f.technique} sub="technique" color={exp.color} />
      {arrow(false)}
      <PathNode title={`${gate} P${f.blocking_pillar ?? "?"}`} sub="control" color={exp.color} />
      {arrow(blocked)}
      <PathNode title={f.unguarded_outcome ?? "impact"} sub={blocked ? "stopped" : "impact"} color={exp.color} filled={!blocked} muted={blocked} />
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="text-[11px] text-[var(--faint)]">{label}</div>
      <div className="mt-0.5 text-2xl font-bold" style={{ color }}>{value}</div>
    </div>
  );
}
