"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { DissentRow } from "@/server/dissent/engine";
import { BRAND } from "@/lib/brand";

/**
 * Neo disagrees with you.
 *
 * The design carries the idea: it is CALM (a colleague speaking, not an alarm firing), it SHOWS
 * ITS EVIDENCE, it states WHAT WOULD CHANGE ITS MIND, and the overrule button sits right there.
 * It never blocks. But if you overrule, you write the reason — and the reason is the artifact.
 *
 * "I could be wrong" is printed on it deliberately. A view that cannot be argued out of is a
 * prejudice, not a judgement.
 */

const SEV: Record<string, string> = { critical: "#ef4444", high: "#f97316", medium: "#f59e0b" };

type Evidence = {
  technique?: string;
  scenario?: string;
  control?: string;
  verification_status?: string;
  tier?: number;
  verdict?: string;
  criticalFindings?: { technique: string }[];
  irreversibleActions?: { action_label: string }[];
};

export default function DissentCard({
  dissent,
  useCaseName,
  canRespond,
}: {
  dissent: DissentRow;
  useCaseName?: string;
  canRespond: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<null | "overrule">(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const ev = (dissent.evidence ?? {}) as Evidence;
  const accent = SEV[dissent.severity] ?? "#8892a4";

  async function respond(action: "accept" | "overrule") {
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/dissent/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: dissent.id, action, reason: reason.trim() || undefined }),
    });
    setBusy(false);
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      setErr(typeof j.error === "string" ? j.error : "Could not record your response.");
      return;
    }
    router.refresh();
  }

  return (
    <div
      className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4"
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--faint)]">
        <span style={{ color: "#3b82f6" }}>✦</span>
        <span className="text-[var(--text)]">{BRAND.name} disagrees</span>
        {useCaseName && <span className="normal-case tracking-normal font-normal">· {useCaseName}</span>}
        <span className="ml-auto normal-case tracking-normal font-normal">
          {Math.round(Number(dissent.confidence) * 100)}% confident
        </span>
      </div>

      {/* The claim — Neo's position, first person, one line. */}
      <p className="mt-2 text-[15px] font-semibold text-[var(--text)]">{dissent.claim}</p>

      {/* The reason — grounded in the evidence, not asserted. */}
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--muted)]">{dissent.reason}</p>

      {/* The falsifier. Conviction has to be falsifiable or it isn't worth listening to. */}
      <div className="mt-3 rounded-lg bg-[var(--surface)] px-3 py-2 text-[12.5px] leading-relaxed text-[var(--muted)]">
        <span className="font-semibold text-[var(--text)]">What would change my mind: </span>
        {dissent.falsifier}
      </div>

      <button
        onClick={() => setOpen((v) => !v)}
        className="mt-3 flex items-center gap-1 text-[12px] font-semibold text-[#3b82f6] hover:underline"
      >
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />} Show me the evidence
      </button>

      {open && (
        <div className="mt-2 space-y-1 rounded-lg bg-[var(--surface)] px-3 py-2 text-[12px] text-[var(--muted)]">
          {ev.control && (
            <div>
              <span className="text-[var(--text)]">Control: </span>{ev.control}
              {ev.verification_status && <span> · {ev.verification_status}</span>}
            </div>
          )}
          {ev.technique && (
            <div>
              <span className="text-[var(--text)]">Red Team: </span>
              {ev.technique}{ev.scenario ? ` — ${ev.scenario}` : ""}
            </div>
          )}
          {typeof ev.tier === "number" && <div><span className="text-[var(--text)]">Assigned tier: </span>Tier {ev.tier}</div>}
          {ev.verdict && <div><span className="text-[var(--text)]">Board decision: </span>{ev.verdict.replace(/_/g, " ")}</div>}
          {!!ev.criticalFindings?.length && (
            <div>
              <span className="text-[var(--text)]">Critical exposed paths: </span>
              {ev.criticalFindings.map((f) => f.technique).join(" · ")}
            </div>
          )}
          {!!ev.irreversibleActions?.length && (
            <div>
              <span className="text-[var(--text)]">Irreversible actions observed: </span>
              {ev.irreversibleActions.map((a) => a.action_label).join(" · ")}
            </div>
          )}
          {dissent.use_case_id && (
            <Link href={`/dashboard/use-cases/${dissent.use_case_id}`} className="inline-block pt-1 font-semibold text-[#3b82f6] hover:underline">
              Open the use case →
            </Link>
          )}
        </div>
      )}

      {canRespond && (
        <>
          {mode !== "overrule" ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                onClick={() => respond("accept")}
                disabled={busy}
                className="rounded-md bg-[#3b82f6] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#2f6fd6] disabled:opacity-50"
              >
                {BRAND.name}&rsquo;s right — I&rsquo;ll act on it
              </button>
              <button
                onClick={() => setMode("overrule")}
                disabled={busy}
                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text)] hover:border-[var(--border-strong)] disabled:opacity-50"
              >
                Overrule
              </button>
              {/* Said out loud, on purpose. */}
              <span className="text-[11.5px] text-[var(--faint)]">I could be wrong — you own the call either way.</span>
            </div>
          ) : (
            <div className="mt-4">
              <label className="text-[11.5px] leading-relaxed text-[var(--muted)]">
                Why are you overruling? {BRAND.name} steps aside and won&rsquo;t raise this again — but the reason goes on
                the record, and that record is what a board or a post-incident review will read.
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                autoFocus
                placeholder="e.g. A gateway control blocks this path; the finding is a false positive pending re-run."
                className="mt-1.5 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12.5px] text-[var(--text)] outline-none focus:border-[#3b82f6]"
              />
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={() => respond("overrule")}
                  disabled={busy || reason.trim().length < 10}
                  className="rounded-md bg-[#3b82f6] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#2f6fd6] disabled:opacity-40"
                >
                  {busy ? "Recording…" : "Record the overrule"}
                </button>
                <button
                  onClick={() => { setMode(null); setReason(""); }}
                  disabled={busy}
                  className="text-[11.5px] text-[var(--faint)] hover:text-[var(--text)]"
                >
                  Cancel
                </button>
                {reason.trim().length > 0 && reason.trim().length < 10 && (
                  <span className="text-[11px] text-[var(--faint)]">A little more detail.</span>
                )}
              </div>
            </div>
          )}
          {err && <p className="mt-2 text-[11.5px]" style={{ color: "#ef4444" }}>{err}</p>}
        </>
      )}
    </div>
  );
}
