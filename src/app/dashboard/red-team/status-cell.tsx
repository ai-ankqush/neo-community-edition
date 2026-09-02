"use client";

/** Per-finding control status: auto-derived from exposure (blocked = verified), with
 *  a manual "mark control in place" toggle for an admin who knows it's addressed. */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

type Auto = "addressed" | "partial" | "open";

export default function RedTeamStatusCell({ useCaseId, vector, technique, auto, manual, canAct }: {
  useCaseId: string; vector: string; technique: string; auto: Auto; manual: boolean; canAct: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function set(addressed: boolean) {
    if (busy) return; setBusy(true);
    try {
      await fetch("/api/red-team/address", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ useCaseId, vector, technique, addressed }),
      });
      router.refresh();
    } finally { setBusy(false); }
  }

  // Manual override wins; otherwise the auto status.
  if (manual) {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold" style={{ color: "#22c55e", background: "#22c55e1f" }}><Check size={11} /> Control in place</span>
        {canAct && <button onClick={() => set(false)} disabled={busy} className="text-[11px] text-[var(--faint)] hover:text-[var(--text)] disabled:opacity-50">undo</button>}
      </div>
    );
  }

  if (auto === "addressed") {
    return <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold" style={{ color: "#22c55e", background: "#22c55e1f" }}><Check size={11} /> Verified</span>;
  }

  const label = auto === "partial" ? "Partial" : "Open";
  const color = auto === "partial" ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex items-center gap-2">
      <span className="rounded px-2 py-0.5 text-[10px] font-bold" style={{ color, background: `${color}1f` }}>{label}</span>
      {canAct && <button onClick={() => set(true)} disabled={busy} className="text-[11px] font-semibold text-[#3b82f6] hover:underline disabled:opacity-50">{busy ? "…" : "Mark in place"}</button>}
    </div>
  );
}
