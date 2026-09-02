"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, RecBadge } from "@/components/console/ui";

/** ARB-style governance verdict - the human decision, recorded alongside
 *  the engine's recommendation. */

export const VERDICTS: { key: string; label: string; color: string; hint: string }[] = [
  { key: "approved", label: "Approve", color: "#22c55e", hint: "Controls adequate for production use" },
  { key: "approved_with_conditions", label: "Approve with conditions", color: "#3b82f6", hint: "Proceed while closing the listed conditions" },
  { key: "pilot_only_strict_controls", label: "Pilot only - strict controls", color: "#f59e0b", hint: "High risk: limited population, enhanced monitoring, no expansion without re-review" },
  { key: "rejected_pending_technology", label: "Reject - pending technology", color: "#f97316", hint: "Required controls cannot be implemented with the current stack" },
  { key: "rejected", label: "Reject", color: "#ef4444", hint: "Risk exceeds appetite; do not proceed" },
];

interface BoardDecision {
  verdict: string;
  rationale: string;
  decided_by: string;
  created_at: string;
}

export default function DecisionBoard({
  useCaseId,
  engineRecommendation,
  latest,
  canDecide,
  planAllows,
}: {
  useCaseId: string;
  engineRecommendation: string | null;
  latest: BoardDecision | null;
  canDecide: boolean;       // org_admin
  planAllows: boolean;      // decisionBoard !== "view"
}) {
  const router = useRouter();
  const [verdict, setVerdict] = useState<string>(latest?.verdict ?? "");
  const [rationale, setRationale] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latestMeta = VERDICTS.find((v) => v.key === latest?.verdict);

  async function record() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/use-cases/${useCaseId}/board-decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verdict, rationale }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Failed to record");
      setRationale("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-6" accent={latestMeta?.color ?? "#3b82f6"}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--muted)]">
          Review Board Decision
        </h2>
        {engineRecommendation && (
          <span className="flex items-center gap-2 text-xs text-[var(--faint)]">
            Engine recommends: <RecBadge rec={engineRecommendation} />
          </span>
        )}
      </div>

      {latest && latestMeta && (
        <div className="mb-4 rounded-md border border-[var(--border)] bg-[var(--panel)] p-3.5">
          <span
            className="rounded px-2.5 py-1 text-[12px] font-bold"
            style={{ color: latestMeta.color, background: `${latestMeta.color}1f`, border: `1px solid ${latestMeta.color}40` }}
          >
            {latestMeta.label.toUpperCase()}
          </span>
          <p className="mt-2.5 text-[13px] leading-relaxed text-[var(--text)]">{latest.rationale}</p>
          <p className="mt-1.5 text-[11px] text-[var(--faint)]">
            Recorded {new Date(latest.created_at).toLocaleString()}
          </p>
        </div>
      )}

      {!planAllows ? (
        <p className="text-[13px] text-[var(--faint)]">
          Recording board verdicts is available on Starter and above.
        </p>
      ) : !canDecide ? (
        <p className="text-[13px] text-[var(--faint)]">
          Only organization admins can record board decisions.
        </p>
      ) : (
        <div>
          <p className="mb-2 text-[13px] text-[var(--muted)]">
            {latest ? "Record a new verdict (supersedes the current one):" : "Record the board's verdict for this use case:"}
          </p>
          <div className="mb-3 flex flex-wrap gap-2">
            {VERDICTS.map((v) => (
              <button
                key={v.key}
                onClick={() => setVerdict(v.key)}
                title={v.hint}
                className="rounded-md border px-3 py-1.5 text-[12.5px] font-semibold transition"
                style={
                  verdict === v.key
                    ? { color: v.color, background: `${v.color}1f`, borderColor: `${v.color}60` }
                    : { color: "var(--muted)", background: "var(--panel)", borderColor: "var(--border)" }
                }
              >
                {v.label}
              </button>
            ))}
          </div>
          <textarea
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            rows={3}
            placeholder="Decision rationale - what the board weighed, what tipped the verdict (min 10 chars, this is the defensible record)"
            className="w-full rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[#3b82f6]"
          />
          {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
          <button
            onClick={record}
            disabled={busy || !verdict || rationale.trim().length < 10}
            className="mt-3 rounded-md bg-[#3b82f6] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Recording..." : "Record decision"}
          </button>
        </div>
      )}
    </Card>
  );
}
