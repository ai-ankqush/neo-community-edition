"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Share2, X, ArrowRight, Activity, ShieldCheck } from "lucide-react";
import type { ControlGraph } from "@/lib/control-graph";
import { runInference, type Severity, type Lane, type CGFinding } from "@/lib/control-graph-inference";

const tierColor = (t: number | null) =>
  t === 1 ? "#22c55e" : t === 2 ? "#84cc16" : t === 3 ? "#f59e0b" : t === 4 ? "#f97316" : t === 5 ? "#ef4444" : "#64748b";
const sevColor: Record<Severity, string> = { high: "#ef4444", medium: "#f59e0b", low: "#64748b" };
const sevLabel: Record<Severity, string> = { high: "High", medium: "Medium", low: "Low" };
const LANE: Record<Lane, { label: string; color: string; tint: string; Icon: typeof Activity }> = {
  operational: { label: "Operational", color: "#d97706", tint: "#f59e0b1f", Icon: Activity },
  governance: { label: "Governance", color: "#0d9488", tint: "#0d948814", Icon: ShieldCheck },
};
type Filter = "all" | Severity | Lane;
const fkey = (f: CGFinding) => `${f.rule}:${f.useCaseId}`;

export default function InsightsView({ graph, actionFabricEnabled = false }: { graph: ControlGraph; actionFabricEnabled?: boolean }) {
  const findings = useMemo(() => runInference(graph.useCases), [graph]);
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<CGFinding | null>(null);

  const counts = useMemo(() => ({
    all: findings.length,
    high: findings.filter((f) => f.severity === "high").length,
    medium: findings.filter((f) => f.severity === "medium").length,
    low: findings.filter((f) => f.severity === "low").length,
    operational: findings.filter((f) => f.lane === "operational").length,
    governance: findings.filter((f) => f.lane === "governance").length,
  }), [findings]);

  const feed = filter === "all" ? findings
    : filter === "operational" || filter === "governance" ? findings.filter((f) => f.lane === filter)
    : findings.filter((f) => f.severity === filter);

  const top = findings[0];
  const hintFor = (f: CGFinding) => (f.lane === "operational" ? (actionFabricEnabled ? "Send to SOC →" : "Review →") : "Assign owner →");
  const TABS: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "high", label: "High", count: counts.high },
    { key: "operational", label: "Operational", count: counts.operational },
    { key: "governance", label: "Governance", count: counts.governance },
  ];

  return (
    <div className="w-full">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.16em]" style={{ color: "#5f7186" }}>AI Control Graph · Findings</div>

      {/* verdict headline — the answer, not a section title */}
      {counts.all === 0 ? (
        <div className="mt-2 max-w-2xl text-[20px] font-medium leading-snug tracking-[-0.01em] text-[var(--text)]">Nothing needs a decision right now — your AI estate is clear.</div>
      ) : (
        <div className="mt-2 max-w-3xl text-[20px] font-medium leading-snug tracking-[-0.01em] text-[var(--text)]">
          {counts.all} finding{counts.all === 1 ? "" : "s"} need a decision{counts.high ? <> — <span style={{ color: sevColor.high }}>{counts.high} high</span></> : null}.
          {top && <span className="text-[var(--muted)] font-normal">{" "}Start with {top.useCaseName}: {top.label.charAt(0).toLowerCase() + top.label.slice(1)}.</span>}
        </div>
      )}

      {/* understated filter tabs */}
      <div className="mt-6 flex flex-wrap items-center gap-6 border-b border-[var(--border)]">
        {TABS.map((t) => {
          const on = filter === t.key || (t.key === "all" && filter === "all");
          return (
            <button key={t.key} onClick={() => setFilter(t.key)}
              className={`-mb-px border-b-2 pb-2.5 text-[12.5px] transition-colors ${on ? "border-[var(--text)] font-medium text-[var(--text)]" : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"}`}>
              {t.label} <span className="text-[var(--faint)]">{t.count}</span>
            </button>
          );
        })}
        {actionFabricEnabled && (
          <Link href="/dashboard/settings?tab=ai-action-fabric&sub=soc" className="ml-auto flex items-center gap-1.5 pb-2.5 text-[11.5px] text-[var(--muted)] hover:text-[var(--text)]">
            <Share2 size={12} /> Stream operational to SOC
          </Link>
        )}
      </div>

      {/* the premium list — one slim severity accent, hero line, quiet meta, muted resolve hint */}
      <div className="mt-1">
        {feed.map((f) => (
          <button key={fkey(f)} onClick={() => setOpen(f)}
            className="group flex w-full items-stretch gap-4 border-b border-[var(--border)] px-1 py-4 text-left transition-colors last:border-0 hover:bg-[var(--panel)]">
            <span className="w-[3px] shrink-0 rounded-sm" style={{ background: sevColor[f.severity] }} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-medium tracking-[-0.005em] text-[var(--text)]">{f.label}</div>
              <div className="mt-1 text-[12px] tracking-[0.02em] text-[var(--faint)]">{f.useCaseName} · {f.tier ? `Tier ${f.tier}` : "Untiered"}&nbsp;&nbsp;·&nbsp;&nbsp;{LANE[f.lane].label}</div>
            </div>
            <span className="shrink-0 self-center text-[12px] text-[var(--faint)] transition-colors group-hover:text-[#0d9488]">{hintFor(f)}</span>
          </button>
        ))}
        {feed.length === 0 && <p className="py-6 text-[13px] text-[#16a34a]">Nothing flagged in this filter — clear.</p>}
      </div>

      {open && <Drawer f={open} actionFabricEnabled={actionFabricEnabled} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Drawer({ f, actionFabricEnabled, onClose }: { f: CGFinding; actionFabricEnabled: boolean; onClose: () => void }) {
  const L = LANE[f.lane];
  return (
    <div className="fixed inset-0 z-[70] flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative h-full w-full max-w-md overflow-y-auto border-l border-[var(--border)] bg-[var(--bg-elevated)] p-5" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute right-4 top-4 text-[var(--muted)] hover:text-[var(--text)]" aria-label="close"><X size={18} /></button>

        <div className="mb-3 mt-1 flex flex-wrap items-center gap-2">
          <span className="rounded px-2.5 py-1 text-[12px] font-bold" style={{ color: sevColor[f.severity], background: `${sevColor[f.severity]}1f` }}>{sevLabel[f.severity]}</span>
          <span className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold" style={{ color: L.color, background: L.tint }}><L.Icon size={11} />{L.label}</span>
          <span className="rounded px-2 py-1 text-[11px] font-bold" style={{ color: tierColor(f.tier), background: `${tierColor(f.tier)}1f` }}>{f.tier ? `Tier ${f.tier}` : "Untiered"}</span>
        </div>

        <h2 className="text-[16px] font-bold text-[var(--text)]">{f.label}</h2>
        <Link href={`/dashboard/use-cases/${f.useCaseId}`} className="text-[12.5px] font-semibold text-[#0d9488] hover:underline">{f.useCaseName} →</Link>

        <Line label="What's the issue">{f.why}</Line>
        <Line label="What to do">{f.recommendation}</Line>

        <div className="mb-3.5">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Evidence</div>
          <div className="flex flex-wrap gap-1.5">
            {f.evidence.map((e, i) => <span key={i} className="rounded border border-[var(--border)] bg-[var(--panel)] px-2 py-0.5 text-[11px] text-[var(--muted)]">{e}</span>)}
          </div>
        </div>

        {/* lane-specific footer: where the action actually happens */}
        {f.lane === "operational" ? (
          <div className="mt-4 border-t border-[var(--border)] pt-3">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Act on it</div>
            <div className="flex flex-col gap-2">
              {actionFabricEnabled ? (
                <>
                  <FooterLink href="/dashboard/action-control/connect" label="Stream to SOC (SIEM / SOAR)" primary />
                  <FooterLink href="/dashboard/settings?tab=ai-action-fabric" label="Open enforcement settings" />
                  <FooterLink href={`/dashboard/use-cases/${f.useCaseId}`} label="Open the use case" />
                </>
              ) : (
                <>
                  <FooterLink href={`/dashboard/use-cases/${f.useCaseId}`} label="Open the use case" primary />
                  <p className="px-1 text-[12px] text-[var(--muted)]">Streaming to your SOC and live interdiction arrive with AI Action Fabric.</p>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-4 border-t border-[var(--border)] pt-3">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Assign it an owner</div>
            <div className="flex flex-col gap-2">
              <FooterLink href={`/dashboard/use-cases/${f.useCaseId}/manage`} label="Assign owner / record an exception" primary />
              <FooterLink href={`/dashboard/use-cases/${f.useCaseId}`} label="Record a decision" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3.5 mt-3.5">
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <p className="text-[13px] leading-relaxed text-[var(--text)]">{children}</p>
    </div>
  );
}

function FooterLink({ href, label, primary }: { href: string; label: string; primary?: boolean }) {
  return (
    <Link href={href} className="flex items-center justify-between rounded-md border px-3 py-2 text-[12.5px] font-semibold"
      style={primary
        ? { borderColor: "#0d948880", background: "#0d948814", color: "#0d9488" }
        : { borderColor: "var(--border)", color: "var(--text)" }}>
      {label} <ArrowRight size={13} />
    </Link>
  );
}
