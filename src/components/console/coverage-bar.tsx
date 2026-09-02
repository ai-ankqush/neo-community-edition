import { coverageStatus, type TierTargets } from "@/lib/risk-tolerance";

/** A control-coverage bar that colours against the org's risk appetite for the use case's tier.
 *  Server-safe (no hooks). The vertical mark on the track is the tier's target. */
export function CoverageBar({
  pct, tier, targets, hasGap,
}: { pct: number; tier: number | null; targets: TierTargets; hasGap: boolean }) {
  const s = coverageStatus(pct, tier, targets, hasGap);
  return (
    <div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-semibold" style={{ color: s.color }}>{pct}% covered</span>
        <span className="text-[var(--muted)]">{s.label} · target {s.target}%</span>
      </div>
      <div className="relative mt-1 h-2 rounded bg-[var(--border)]">
        <div className="h-2 rounded" style={{ width: `${Math.min(100, Math.max(2, pct))}%`, background: s.color }} />
        <span
          className="absolute -top-[2px] h-3 w-[2px] opacity-60"
          style={{ left: `calc(${Math.min(100, s.target)}% - 1px)`, background: "var(--text)" }}
          title={`Your target for this tier: ${s.target}%`}
        />
      </div>
    </div>
  );
}

/** One-line legend explaining the colours + the target mark. */
export function CoverageLegend() {
  const items: [string, string][] = [
    ["#dc2626", "Well below target"],
    ["#d97706", "Approaching"],
    ["#16a34a", "Meets your appetite"],
    ["#2563eb", "Full coverage"],
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--muted)]">
      {items.map(([c, l]) => (
        <span key={l} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: c }} />{l}</span>
      ))}
      <span className="text-[var(--faint)]">· the vertical mark is your tier target</span>
    </div>
  );
}
