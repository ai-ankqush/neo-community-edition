"use client";

/** The Control Picture — the plain-English face of a use case.
 *  Verdict first, then four plain tabs (Touches · Can do · Could go wrong · Proof).
 *  Each tab opens with one sentence; the graphs sit underneath as "see the full map".
 *  Lives under AI Control Graph (pick a use case → its Control Picture).
 *  See NeoControl-Product-Language.md. */

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, CheckCircle2, Gavel, Loader2, AlertCircle,
  Boxes, Zap, ShieldAlert, BadgeCheck, ArrowRight,
} from "lucide-react";
import type { ControlPicture, ChipTone, VerdictState } from "@/lib/control-picture";

const VERDICT: Record<VerdictState, { color: string; bg: string; Icon: typeof AlertTriangle }> = {
  ready:          { color: "#22c55e", bg: "#22c55e14", Icon: CheckCircle2 },
  conditions:     { color: "#f59e0b", bg: "#f59e0b14", Icon: CheckCircle2 },
  not_ready:      { color: "#f59e0b", bg: "#f59e0b14", Icon: AlertTriangle },
  needs_decision: { color: "#3b82f6", bg: "#3b82f614", Icon: Gavel },
  in_progress:    { color: "#94a3b8", bg: "#94a3b814", Icon: Loader2 },
};

const CHIP: Record<ChipTone, string> = {
  model:       "border-[#a855f740] bg-[#a855f714] text-[#c084fc]",
  data:        "border-[#3b82f640] bg-[#3b82f614] text-[#60a5fa]",
  tool:        "border-[var(--border)] bg-[var(--bg)] text-[var(--muted)]",
  vendor_ok:   "border-[#22c55e40] bg-[#22c55e14] text-[#4ade80]",
  vendor_warn: "border-[#f59e0b40] bg-[#f59e0b14] text-[#fbbf24]",
};

type TabKey = "touches" | "cando" | "wrong" | "proof";
const TABS: { key: TabKey; label: string; Icon: typeof Boxes }[] = [
  { key: "touches", label: "Touches", Icon: Boxes },
  { key: "cando", label: "Can do", Icon: Zap },
  { key: "wrong", label: "Could go wrong", Icon: ShieldAlert },
  { key: "proof", label: "Proof", Icon: BadgeCheck },
];

export default function ControlPictureCard({ picture, useCaseId, onSeeMap }: { picture: ControlPicture; useCaseId: string; onSeeMap?: () => void }) {
  const [tab, setTab] = useState<TabKey>("touches");
  const v = VERDICT[picture.verdict.state];

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
      {/* verdict — the headline answer */}
      <div className="flex items-start gap-3 px-4 py-3.5" style={{ background: v.bg }}>
        <v.Icon className="mt-0.5 h-5 w-5 shrink-0" style={{ color: v.color }} />
        <div>
          <div className="text-[15px] font-bold leading-tight" style={{ color: v.color }}>{picture.verdict.headline}</div>
          <div className="mt-0.5 text-[13px] leading-snug text-[var(--text)] opacity-90">{picture.verdict.sub}</div>
        </div>
        <span className="ml-auto mt-0.5 hidden text-[11px] uppercase tracking-wide text-[var(--faint)] sm:block">Control picture</span>
      </div>

      {/* four plain tabs */}
      <div className="flex gap-0.5 border-b border-[var(--border)] px-2">
        {TABS.map((t) => {
          const on = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] transition-colors ${
                on ? "border-[#3b82f6] font-semibold text-[var(--text)]" : "border-transparent text-[var(--faint)] hover:text-[var(--muted)]"
              }`}
            >
              <t.Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* panel — one plain sentence, then human detail, then the map as evidence */}
      <div className="px-4 py-4">
        {tab === "touches" && (
          <Panel onClick={onSeeMap} link={`/dashboard/supply-chain?uc=${useCaseId}`} linkLabel="See the full map">
            <p className="text-[14px] leading-relaxed text-[var(--text)]">{picture.touches.sentence}</p>
            {picture.touches.chips.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {picture.touches.chips.map((c, i) => (
                  <span key={i} className={`rounded-md border px-2 py-0.5 text-[12px] ${CHIP[c.tone]}`}>{c.label}</span>
                ))}
              </div>
            )}
          </Panel>
        )}
        {tab === "cando" && (
          <Panel onClick={onSeeMap} link={`/dashboard/supply-chain?uc=${useCaseId}`} linkLabel="See the authority map">
            <p className="text-[14px] leading-relaxed text-[var(--text)]">{picture.canDo.sentence}</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--muted)]">{picture.canDo.detail}</p>
          </Panel>
        )}
        {tab === "wrong" && (
          <Panel link="/dashboard/red-team" linkLabel="See the attack paths">
            <p className="text-[14px] leading-relaxed text-[var(--text)]">{picture.couldGoWrong.sentence}</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--muted)]">{picture.couldGoWrong.detail}</p>
          </Panel>
        )}
        {tab === "proof" && (
          <Panel link={`/dashboard/use-cases/${useCaseId}/report`} linkLabel="See the proof">
            <p className="text-[14px] leading-relaxed text-[var(--text)]">{picture.proof.sentence}</p>
            <div className="mt-3 flex flex-col gap-1.5">
              {picture.proof.items.map((it, i) => (
                <div key={i} className="flex items-center gap-2 text-[13px] text-[var(--muted)]">
                  {it.ok
                    ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[#22c55e]" />
                    : <AlertCircle className="h-4 w-4 shrink-0 text-[#f59e0b]" />}
                  {it.label}
                </div>
              ))}
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

function Panel({ children, link, linkLabel, onClick }: { children: React.ReactNode; link: string; linkLabel: string; onClick?: () => void }) {
  const cls = "mt-3.5 inline-flex items-center gap-1 text-[12px] text-[var(--faint)] hover:text-[#3b82f6]";
  return (
    <div>
      {children}
      {onClick ? (
        <button onClick={onClick} className={cls}>{linkLabel} <ArrowRight className="h-3 w-3" /></button>
      ) : (
        <Link href={link} className={cls}>{linkLabel} <ArrowRight className="h-3 w-3" /></Link>
      )}
    </div>
  );
}
