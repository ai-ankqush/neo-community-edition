"use client";

import { useState } from "react";

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

export default function ControlVerify({ controlId, canVerify, initial }: { controlId: string; canVerify: boolean; initial: Ev }) {
  const [ev, setEv] = useState<Ev>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  const s = ev ? STYLE[ev.result] ?? STYLE.error : null;

  return (
    <div className="mt-2 rounded-md border border-[#3b82f640] bg-[#3b82f60a] px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-[#3b82f6]">Live verification</span>
        {s && <span className="rounded px-1.5 py-0.5 text-[11px] font-bold" style={{ color: s.color, background: s.bg }}>{s.label}</span>}
        {ev?.provider && <span className="text-[11px] text-[var(--faint)]">via {ev.provider}</span>}
        {canVerify && (
          <button onClick={run} disabled={busy}
            className="ml-auto rounded-md bg-[#3b82f6] px-3 py-1 text-[11.5px] font-semibold text-white disabled:opacity-50">
            {busy ? "Checking…" : ev ? "Re-verify" : "Verify live"}
          </button>
        )}
      </div>
      {ev && (
        <div className="mt-1.5 space-y-0.5 text-[12px] text-[var(--muted)]">
          {ev.note && <p>{ev.note}</p>}
          {ev.rawArtifactRef && (
            <a href={ev.rawArtifactRef} target="_blank" rel="noopener noreferrer" className="text-[#3b82f6] underline">view evidence ↗</a>
          )}
          {ev.remediationHint && <p className="text-[#f59e0b]">Fix: {ev.remediationHint}</p>}
          <p className="text-[10.5px] text-[var(--faint)]">
            {ev.checkedAt && <>Checked {new Date(ev.checkedAt).toLocaleString()}</>}
            {ev.validUntil && <> · fresh until {new Date(ev.validUntil).toLocaleDateString()}</>}
          </p>
        </div>
      )}
      {err && <p className="mt-1 text-[12px] text-red-500">{err}</p>}
    </div>
  );
}
