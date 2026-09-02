"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { STAGES, STAGE_LABELS, type Stage } from "@/lib/types/stages";

/** Stage progress chips. Completed stages are clickable: one click rewinds
 *  there (clearing that stage + everything after) so it can be regenerated. */
export default function StageChips({
  useCaseId,
  currentStage,
}: {
  useCaseId: string;
  currentStage: Stage;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const currentIdx = STAGES.indexOf(currentStage);

  async function rewindTo(target: Stage) {
    const targetIdx = STAGES.indexOf(target);
    const cleared = STAGES.slice(targetIdx, currentIdx + 1)
      .map((s) => STAGE_LABELS[s])
      .join(", ");
    if (
      !confirm(
        `Rewind to ${STAGE_LABELS[target]}?\n\nThis clears and allows regeneration of: ${cleared}.\nEverything before ${STAGE_LABELS[target]} stays locked.`
      )
    )
      return;
    setBusy(true);
    const res = await fetch(`/api/use-cases/${useCaseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rewind_to", targetStage: target }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      alert(typeof json.error === "string" ? json.error : "Rewind failed");
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="mb-5 flex flex-wrap gap-1.5">
      {STAGES.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        if (done) {
          return (
            <button
              key={s}
              onClick={() => rewindTo(s)}
              disabled={busy}
              title={`Rewind to ${STAGE_LABELS[s]} and regenerate from here`}
              className="group rounded-full border border-[#22c55e40] bg-[#22c55e1f] px-3 py-1 text-[11px] font-semibold text-[var(--good)] hover:border-[#f59e0b60] hover:bg-[#f59e0b1f] hover:text-[#f59e0b] disabled:opacity-50"
            >
              <span className="group-hover:hidden">✓ {STAGE_LABELS[s]}</span>
              <span className="hidden group-hover:inline">↻ {STAGE_LABELS[s]}</span>
            </button>
          );
        }
        return (
          <span
            key={s}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
              active
                ? "border border-[#3b82f6] bg-[#3b82f6] text-white"
                : "border border-[var(--border)] bg-[var(--surface)] text-[#4b5563]"
            }`}
          >
            {STAGE_LABELS[s]}
          </span>
        );
      })}
    </div>
  );
}
