"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Manual implementation-status tracker for a control (all plans). */
export const CONTROL_STATES: { key: string; label: string; color: string }[] = [
  { key: "gap", label: "Not in place", color: "#ef4444" },
  { key: "partial", label: "Partial", color: "#f59e0b" },
  { key: "in_place", label: "Implemented", color: "#22c55e" },
];

export default function ControlStatusSelect({
  controlId,
  status,
  canEdit,
}: {
  controlId: string;
  status: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [busy, setBusy] = useState(false);
  const meta = CONTROL_STATES.find((s) => s.key === value) ?? CONTROL_STATES[0];

  if (!canEdit) {
    return (
      <span
        className="inline-block whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-bold"
        style={{ color: meta.color, background: `${meta.color}1a`, border: `1px solid ${meta.color}35` }}
      >
        {meta.label}
      </span>
    );
  }

  async function change(next: string) {
    setValue(next);
    setBusy(true);
    await fetch(`/api/controls/${controlId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ implementationStatus: next }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <select
      value={value}
      disabled={busy}
      onChange={(e) => change(e.target.value)}
      className="rounded border bg-[var(--panel)] px-2 py-1 text-[12px] font-semibold outline-none disabled:opacity-50"
      style={{ color: meta.color, borderColor: `${meta.color}40` }}
    >
      {CONTROL_STATES.map((s) => (
        <option key={s.key} value={s.key} style={{ color: "var(--text)", background: "var(--surface)" }}>
          {s.label}
        </option>
      ))}
    </select>
  );
}
