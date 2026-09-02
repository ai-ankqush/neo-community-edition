"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Auditor-style status dropdown for assurance tests. */
export const TEST_STATES: { key: string; label: string; color: string }[] = [
  { key: "not_started", label: "Open", color: "var(--faint)" },
  { key: "in_progress", label: "In Review", color: "#3b82f6" },
  { key: "passed", label: "Passed", color: "#22c55e" },
  { key: "failed", label: "Failed", color: "#ef4444" },
];

export function testMeta(result: string) {
  return TEST_STATES.find((s) => s.key === result) ?? TEST_STATES[0];
}

export default function TestStatusSelect({
  testId,
  result,
  canEdit,
}: {
  testId: string;
  result: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(result);
  const [busy, setBusy] = useState(false);
  const meta = testMeta(value);

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
    await fetch(`/api/tests/${testId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result: next }),
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
      {TEST_STATES.map((s) => (
        <option key={s.key} value={s.key} style={{ color: "var(--text)", background: "var(--surface)" }}>
          {s.label}
        </option>
      ))}
    </select>
  );
}
