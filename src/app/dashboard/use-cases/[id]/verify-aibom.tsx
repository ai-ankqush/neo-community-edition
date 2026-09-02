"use client";

import { useState } from "react";

type Evidence = {
  result: string;
  rawArtifactRef?: string | null;
  remediationHint?: string | null;
  checkedAt?: string | null;
  validUntil?: string | null;
  confidence?: string | null;
  note?: string | null;
} | null;

const STYLE: Record<string, { label: string; color: string; bg: string }> = {
  pass: { label: "PASS", color: "#22c55e", bg: "#22c55e14" },
  fail: { label: "FAIL", color: "#ef4444", bg: "#ef444414" },
  partial: { label: "PARTIAL", color: "#f59e0b", bg: "#f59e0b14" },
  error: { label: "ERROR", color: "#8892a4", bg: "#8892a414" },
};

export default function VerifyAibom({
  useCaseId, canVerify, hasConnection, initial,
}: {
  useCaseId: string;
  canVerify: boolean;
  hasConnection: boolean;
  initial: Evidence;
}) {
  const [ev, setEv] = useState<Evidence>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/use-cases/${useCaseId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capabilityId: "ai_bom_present_and_valid" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Verification failed");
      const c = json.check;
      setEv({
        result: c.result,
        rawArtifactRef: c.rawArtifactRef,
        remediationHint: c.remediationHint,
        checkedAt: new Date().toISOString(),
        validUntil: c.validUntil ?? null,
        confidence: c.confidence,
        note: c.note,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  const s = ev ? STYLE[ev.result] ?? STYLE.error : null;

  return (
    <div className="mt-5 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-center gap-3">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--muted)]">AI-BOM verification</p>
          <p className="mt-0.5 text-[12px] text-[var(--faint)]">
            Live check that a valid CycloneDX ML-BOM exists in the connected repo.
          </p>
        </div>
        {s && (
          <span className="ml-auto rounded px-2.5 py-1 text-[12px] font-bold" style={{ color: s.color, background: s.bg }}>
            {s.label}
          </span>
        )}
      </div>

      {ev && (
        <div className="mt-3 space-y-1 text-[12.5px] text-[var(--muted)]">
          {ev.note && <p>{ev.note}</p>}
          {ev.rawArtifactRef && (
            <p>
              Evidence:{" "}
              <a href={ev.rawArtifactRef} target="_blank" rel="noopener noreferrer" className="text-[#3b82f6] underline">
                view AI-BOM file ↗
              </a>
            </p>
          )}
          {ev.remediationHint && <p className="text-[#f59e0b]">Fix: {ev.remediationHint}</p>}
          <p className="text-[11px] text-[var(--faint)]">
            {ev.checkedAt && <>Checked {new Date(ev.checkedAt).toLocaleString()}</>}
            {ev.validUntil && <> · fresh until {new Date(ev.validUntil).toLocaleDateString()}</>}
            {ev.confidence && <> · {ev.confidence} confidence</>}
          </p>
        </div>
      )}

      <div className="mt-3 flex items-center gap-3">
        {canVerify ? (
          hasConnection ? (
            <button
              onClick={run}
              disabled={busy}
              className="rounded-md bg-[#3b82f6] px-4 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Verifying…" : ev ? "Re-verify" : "Verify AI-BOM"}
            </button>
          ) : (
            <p className="text-[12px] text-[var(--faint)]">
              Connect a GitHub repo in{" "}
              <a href="/dashboard/settings" className="text-[#3b82f6] underline">Settings → Connections</a> to run this check.
            </p>
          )
        ) : (
          <p className="text-[12px] text-[var(--faint)]">An admin or assessor can run this verification.</p>
        )}
      </div>
      {err && <p className="mt-2 text-[12.5px] text-red-500">{err}</p>}
    </div>
  );
}
