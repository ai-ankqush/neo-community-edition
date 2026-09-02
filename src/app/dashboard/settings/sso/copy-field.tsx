"use client";

import { useState } from "react";

export default function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be blocked; the value is still selectable */
    }
  }

  return (
    <div>
      <label className="mb-1 block text-[11px] uppercase text-[var(--faint)]">{label}</label>
      <div className="flex items-stretch gap-2">
        <code className="flex-1 overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-[12px] text-[var(--text)]">
          {value}
        </code>
        <button
          onClick={copy}
          className="shrink-0 rounded-md border border-[var(--border)] px-3 text-[12px] font-semibold text-[var(--muted)] hover:border-[#3b82f660] hover:text-[#3b82f6]"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
