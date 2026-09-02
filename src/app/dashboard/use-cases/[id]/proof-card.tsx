"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Slide-3 "proof card": Control → As code → Verified, for a control with a
 *  live capability check. Owns the verify action and renders the three-panel
 *  proof flow (control identity, generated implementation, live PASS/FAIL +
 *  provider, freshness and tamper-evident evidence). */

type Ev = {
  result: string;
  rawArtifactRef?: string | null;
  remediationHint?: string | null;
  checkedAt?: string | null;
  validUntil?: string | null;
  provider?: string | null;
  note?: string | null;
} | null;

const STYLE: Record<string, { label: string; color: string; bg: string }> = {
  pass: { label: "PASS", color: "#22c55e", bg: "#22c55e14" },
  fail: { label: "FAIL", color: "#ef4444", bg: "#ef444414" },
  partial: { label: "PARTIAL", color: "#f59e0b", bg: "#f59e0b14" },
  error: { label: "ERROR", color: "#8892a4", bg: "#8892a414" },
};

function agoLabel(iso?: string | null): string {
  if (!iso) return "—";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function freshnessLabel(checkedAt?: string | null, validUntil?: string | null): string {
  if (!checkedAt || !validUntil) return "—";
  const ms = new Date(validUntil).getTime() - new Date(checkedAt).getTime();
  if (ms <= 0) return "expired";
  const h = Math.round(ms / 3_600_000);
  return h >= 48 ? `${Math.round(h / 24)}d` : `${h}h`;
}

const Panel = ({ label, accent, children }: { label: string; accent: string; children: React.ReactNode }) => (
  <div className="flex-1 rounded-[10px] border border-[var(--border)] bg-[var(--panel)] p-3.5" style={{ borderTop: `2px solid ${accent}` }}>
    <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: accent }}>{label}</p>
    {children}
  </div>
);

const Arrow = () => (
  <div className="hidden shrink-0 items-center self-center text-[var(--faint)] md:flex">→</div>
);

export default function ProofCard({
  controlId, pillar, pillarName, controlName, requirement, code, canVerify, initial,
}: {
  controlId: string;
  pillar: number;
  pillarName: string;
  controlName: string;
  requirement?: string | null;
  code?: string | null;
  canVerify: boolean;
  initial: Ev;
}) {
  const [ev, setEv] = useState<Ev>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  async function run() {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/controls/${controlId}/verify`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(typeof j.error === "string" ? j.error : "Verification failed");
      const c = j.check;
      setEv({
        result: c.result, rawArtifactRef: c.rawArtifactRef, remediationHint: c.remediationHint,
        checkedAt: new Date().toISOString(), validUntil: c.validUntil, provider: j.provider, note: c.note,
      });
      // a pass just flipped the control's status server-side — refresh so the Controls tab
      // and portfolio reflect Ready/Verified without a manual reload.
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  const s = ev ? STYLE[ev.result] ?? STYLE.error : null;
  const Row = ({ k, children }: { k: string; children: React.ReactNode }) => (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-[11px] text-[var(--faint)]">{k}</span>
      <span className="truncate text-right text-[12px] font-medium text-[var(--text)]">{children}</span>
    </div>
  );

  return (
    <div className="mt-1">
      <div className="flex flex-col gap-2 md:flex-row md:items-stretch">
        {/* CONTROL */}
        <Panel label="Control" accent="#06d6d6">
          <p className="text-[13px] font-semibold leading-snug text-[var(--text)]">{controlName}</p>
          <p className="mt-1 text-[11px] text-[var(--faint)]">Pillar {pillar} · {pillarName}</p>
          {requirement && <p className="mt-2 line-clamp-3 text-[11.5px] leading-snug text-[var(--muted)]">{requirement}</p>}
          <span className="mt-2 inline-block rounded bg-[var(--surface)] px-2 py-0.5 text-[10px] font-semibold text-[var(--muted)]">required</span>
        </Panel>

        <Arrow />

        {/* AS CODE */}
        <Panel label="As code" accent="#06d6d6">
          {code ? (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-[var(--bg)] p-2 font-mono text-[11px] leading-relaxed text-[var(--muted)]">{code}</pre>
          ) : (
            <p className="text-[11.5px] text-[var(--faint)]">Generated in the Implementation Pack — Terraform, policy &amp; SIEM rules for your stack.</p>
          )}
        </Panel>

        <Arrow />

        {/* VERIFIED */}
        <Panel label="Verified" accent={s ? s.color : "#22c55e"}>
          <div className="mb-2 flex items-center gap-2">
            {s
              ? <span className="rounded px-2 py-0.5 text-[12px] font-bold" style={{ color: s.color, background: s.bg }}>✓ {s.label}</span>
              : <span className="text-[12px] text-[var(--faint)]">Not yet verified</span>}
            {canVerify && (
              <button onClick={run} disabled={busy}
                className="ml-auto rounded-md bg-[#3b82f6] px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50">
                {busy ? "Checking…" : ev ? "Re-verify" : "Verify live"}
              </button>
            )}
          </div>
          {ev ? (
            <div className="space-y-0">
              <Row k="Provider">{ev.provider ?? "—"}</Row>
              <Row k="Checked">{agoLabel(ev.checkedAt)}</Row>
              <Row k="Freshness">{freshnessLabel(ev.checkedAt, ev.validUntil)}</Row>
              <Row k="Evidence">
                {ev.rawArtifactRef
                  ? <a href={ev.rawArtifactRef} target="_blank" rel="noopener noreferrer" className="font-mono text-[#3b82f6] underline">tamper-evident ↗</a>
                  : <span className="font-mono text-[var(--faint)]">tamper-evident</span>}
              </Row>
              {ev.remediationHint && s?.label === "FAIL" && <p className="mt-1.5 text-[11px] text-[#f59e0b]">Fix: {ev.remediationHint}</p>}
            </div>
          ) : (
            <p className="text-[11.5px] text-[var(--faint)]">Run the live check to prove this control against your connected stack.</p>
          )}
          {err && <p className="mt-1 text-[11px] text-red-500">{err}</p>}
        </Panel>
      </div>
    </div>
  );
}
