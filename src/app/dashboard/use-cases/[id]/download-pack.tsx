"use client";

import { useState } from "react";

export default function DownloadPack({
  useCaseId,
  ready = true,
  withCode = false,
}: {
  useCaseId: string;
  /** false = code-gen plan with no artifacts yet → greyed until code is generated */
  ready?: boolean;
  /** true = generated code is included in the pack */
  withCode?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/use-cases/${useCaseId}/pack`, { cache: "no-store" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(typeof j.error === "string" ? j.error : "Could not build pack");
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      const m = cd.match(/filename="([^"]+)"/);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = m?.[1] ?? "neo-implementation-pack.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not build pack");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <div className="flex flex-col items-end">
        <span
          className="cursor-not-allowed rounded-md border border-dashed border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--faint)] opacity-70"
          title="Generate the code first — the pack download unlocks once the scaffolds are ready"
        >
          Pack · generate code first
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end">
      <button
        onClick={download}
        disabled={busy}
        className={`rounded-md border px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
          withCode
            ? "border-[#22c55e60] text-[var(--good)] hover:bg-[#22c55e14]"
            : "border-[var(--border)] text-[var(--muted)] hover:border-[#3b82f660] hover:text-[#3b82f6]"
        }`}
        title="Download a zip: per-tech runbooks, the checklist, generated code scaffolds, and a Jira/Linear tickets CSV"
      >
        {busy ? "Building…" : withCode ? "↓ Pack ready (with code)" : "↓ Download pack"}
      </button>
      {err && <span className="mt-1 text-[11px] text-red-500">{err}</span>}
    </div>
  );
}
