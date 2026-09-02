"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ConditionItem({
  id,
  text,
  canAct,
}: {
  id: string;
  text: string;
  canAct: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function close() {
    setBusy(true);
    await fetch(`/api/conditions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "closed" }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <li className="flex items-start gap-2">
      <span className="text-[#f59e0b]">⚑</span>
      <span className="flex-1">{text}</span>
      {canAct && (
        <button
          onClick={close}
          disabled={busy}
          className="shrink-0 rounded border border-[#22c55e40] px-2 py-0.5 text-[11px] font-semibold text-[var(--good)] hover:bg-[#22c55e14] disabled:opacity-50"
        >
          {busy ? "…" : "Mark closed"}
        </button>
      )}
    </li>
  );
}
