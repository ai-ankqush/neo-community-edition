"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteButton({
  useCaseId,
  useCaseName,
  unlimited = false,  // enterprise: no slot concept, hard delete always
  consumed = false,   // a slot has been consumed (engine has run)
}: {
  useCaseId: string;
  useCaseName: string;
  unlimited?: boolean;
  consumed?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  // On a capped plan, once a slot is consumed the action is Archive (slot
  // stays used) - never call it Delete, that implies you'd reclaim the slot.
  const isArchive = consumed && !unlimited;

  async function run() {
    const msg = isArchive
      ? `Archive "${useCaseName}"?\n\nThis use case has consumed an assessment slot. Archiving hides it from your lists but the record is retained and the slot stays used until your plan renews. It does NOT free a slot.`
      : `Delete "${useCaseName}"?\n\nNo assessment has run yet, so this is removed permanently and frees nothing to reclaim.`;
    if (!confirm(msg)) return;
    setBusy(true);
    const res = await fetch(`/api/use-cases/${useCaseId}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/dashboard/use-cases");
      router.refresh();
    } else {
      const json = await res.json().catch(() => ({}));
      alert(typeof json.error === "string" ? json.error : "Failed");
      setBusy(false);
    }
  }

  return (
    <button
      onClick={run}
      disabled={busy}
      className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)] hover:border-red-500/40 hover:text-red-400 disabled:opacity-50"
      title={isArchive ? "Archive - the slot stays used this period" : "Delete permanently"}
    >
      {busy ? "..." : isArchive ? "Archive" : "Delete"}
    </button>
  );
}
