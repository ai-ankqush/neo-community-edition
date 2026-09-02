"use client";

import { Layers, ArrowRight } from "lucide-react";
import Link from "next/link";
import type { SharedControlsView, SharedControl } from "@/server/control-graph/shared-controls";

/**
 * "Shared controls — highest leverage."
 *
 * When five use cases run on the same integration, the same control is recommended five times. This
 * panel collapses those copies to the ONE control they really are, and ranks the open ones by how
 * many use cases a single fix (or a single live check) would lift. It's blast-radius in reverse:
 * where the most leverage sits.
 */

const STATE: Record<string, { label: string; color: string }> = {
  gap: { label: "Gap", color: "#ef4444" },
  attested: { label: "Attested, unproven", color: "#f59e0b" },
  proven: { label: "Proven", color: "#22c55e" },
};
const providerName = (p: string) => p.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default function SharedControlsPanel({ data }: { data: SharedControlsView }) {
  if (data.uniqueCount === 0) return null;
  const open = data.openLeverage.slice(0, 6);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
      <div className="flex items-center gap-2">
        <Layers size={16} className="text-[#0d9488]" />
        <span className="text-[11px] font-bold uppercase tracking-wide text-[#0d9488]">Shared controls · highest leverage</span>
      </div>

      {/* the de-duplication headline — the same control, counted once */}
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--muted)]">
        <span className="font-semibold text-[var(--text)]">{data.instanceCount}</span> control recommendations across your
        estate are really <span className="font-semibold text-[var(--text)]">{data.uniqueCount}</span> shared controls
        {data.dedupeDelta > 0 && <> — {data.dedupeDelta} duplicate{data.dedupeDelta === 1 ? "" : "s"} collapsed</>}.
        Each sits on an integration many use cases share, so closing it once lifts them all.
      </p>

      {open.length === 0 ? (
        <p className="mt-3 text-[12.5px] text-[var(--muted)]">Every shared control is proven. Nothing outstanding at the estate level.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {open.map((s) => (
            <Row key={s.capabilityId} s={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ s }: { s: SharedControl }) {
  const st = STATE[s.state] ?? STATE.gap;
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold text-[var(--text)]">{s.name}</span>
            {s.pillarName && <span className="text-[11px] text-[var(--faint)]">· {s.pillarName}</span>}
            <span className="rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ color: st.color, background: `${st.color}1a` }}>
              {st.label}
            </span>
          </div>
          <p className="mt-1 text-[12px] text-[var(--muted)]">
            <span className="font-semibold text-[var(--text)]">Affects {s.leverage} use case{s.leverage === 1 ? "" : "s"}</span>
            {" — "}{s.useCaseNames.slice(0, 3).join(", ")}{s.useCaseNames.length > 3 ? ` +${s.useCaseNames.length - 3} more` : ""}.
          </p>
        </div>
        {/* the leverage number, big and plain */}
        <div className="shrink-0 text-right">
          <div className="text-[20px] font-bold leading-none text-[#0d9488]">×{s.leverage}</div>
          <div className="text-[9px] uppercase tracking-wide text-[var(--faint)]">one fix</div>
        </div>
      </div>

      {/* the action — one live check proves it for ALL of them, because evidence is capability-scoped */}
      <div className="mt-2 flex items-center gap-1.5 text-[11.5px]">
        {s.connected ? (
          <span className="text-[#0d9488]">
            <ArrowRight size={12} className="mr-1 inline" />
            {providerName(s.providers[0] ?? "the integration")} is connected — one live check proves this across all {s.leverage}.
          </span>
        ) : s.providers.length ? (
          <Link href="/dashboard/integrations" className="font-semibold text-[#3b82f6] hover:underline">
            Connect {providerName(s.providers[0])} → prove it once for all {s.leverage} →
          </Link>
        ) : (
          <span className="text-[var(--faint)]">Close on the shared integration to lift all {s.leverage}.</span>
        )}
      </div>
    </div>
  );
}
