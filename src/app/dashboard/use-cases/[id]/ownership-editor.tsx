"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const FUNCTIONS = ["IT", "Security", "Legal", "HR", "Finance", "Marketing", "Sales", "Support", "Customer Relations", "Operations", "Company-wide", "Other"];

export default function OwnershipEditor({
  useCaseId,
  businessFunction,
  ownerName,
  ownerEmail,
  canEdit,
}: {
  useCaseId: string;
  businessFunction: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [fn, setFn] = useState(businessFunction ?? "");
  const [on, setOn] = useState(ownerName ?? "");
  const [oe, setOe] = useState(ownerEmail ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/use-cases/${useCaseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", businessFunction: fn, ownerName: on, ownerEmail: oe }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(typeof j.error === "string" ? j.error : "Could not save");
      }
      setEditing(false);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const hasAny = businessFunction || ownerName;

  if (!editing) {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[var(--muted)]">
        {ownerName && (
          <span>
            <span className="text-[var(--faint)]">Owner:</span> <span className="font-medium text-[var(--text)]">{ownerName}</span>
            {ownerEmail && <span className="text-[var(--faint)]"> · {ownerEmail}</span>}
          </span>
        )}
        {canEdit && (
          <button onClick={() => setEditing(true)} className="text-[11px] font-semibold text-[#3b82f6] hover:underline">
            {hasAny ? "Edit" : "+ Add function & owner"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <select value={fn} onChange={(e) => setFn(e.target.value)} className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1.5 text-[12.5px] text-[var(--text)] outline-none focus:border-[#3b82f6]">
          <option value="">Business function…</option>
          {FUNCTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <input value={on} onChange={(e) => setOn(e.target.value)} placeholder="Owner (person or team)" className="flex-1 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1.5 text-[12.5px] text-[var(--text)] outline-none focus:border-[#3b82f6]" />
        <input value={oe} onChange={(e) => setOe(e.target.value)} type="email" placeholder="Owner email (optional)" className="flex-1 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1.5 text-[12.5px] text-[var(--text)] outline-none focus:border-[#3b82f6]" />
      </div>
      {err && <p className="mt-2 text-[12px] text-red-500">{err}</p>}
      <div className="mt-2 flex gap-2">
        <button onClick={save} disabled={busy} className="rounded-md bg-[#3b82f6] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
        <button onClick={() => { setEditing(false); setFn(businessFunction ?? ""); setOn(ownerName ?? ""); setOe(ownerEmail ?? ""); }} className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[12px] font-semibold text-[var(--muted)]">Cancel</button>
      </div>
    </div>
  );
}
