"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_TIER_TARGETS, type TierTargets } from "@/lib/risk-tolerance";

const TIERS: [string, string][] = [
  ["1", "Tier 1 · minimal"],
  ["2", "Tier 2 · limited"],
  ["3", "Tier 3 · elevated"],
  ["4", "Tier 4 · high"],
  ["5", "Tier 5 · critical"],
];

export default function RiskToleranceEditor({ initial, canEdit }: { initial: TierTargets; canEdit: boolean }) {
  const router = useRouter();
  const [t, setT] = useState<TierTargets>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (k: string, v: number) => { setSaved(false); setT((p) => ({ ...p, [k]: Math.max(0, Math.min(100, v)) })); };

  async function save() {
    setSaving(true); setErr(null); setSaved(false);
    try {
      const r = await fetch("/api/org/risk-tolerance", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ targets: t }),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(typeof j.error === "string" ? j.error : "Save failed"); }
      setSaved(true); router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-2 sm:grid-cols-5">
        {TIERS.map(([k, label]) => (
          <label key={k} className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--muted)]">
            {label}
            <div className="flex items-center gap-1">
              <input
                type="number" min={0} max={100} value={t[k] ?? DEFAULT_TIER_TARGETS[k]} disabled={!canEdit}
                onChange={(e) => set(k, parseInt(e.target.value || "0", 10))}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1.5 text-[13px] text-[var(--text)] disabled:opacity-60"
              />
              <span className="text-[var(--faint)]">%</span>
            </div>
          </label>
        ))}
      </div>
      {canEdit ? (
        <div className="flex items-center gap-3">
          <button onClick={save} disabled={saving} className="rounded-md bg-[#3b82f6] px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-60">
            {saving ? "Saving…" : "Save targets"}
          </button>
          {saved && <span className="text-[12px] text-[#16a34a]">Saved.</span>}
          {err && <span className="text-[12px] text-[#dc2626]">{err}</span>}
        </div>
      ) : (
        <p className="text-[11px] text-[var(--faint)]">Only an organization admin can change these.</p>
      )}
    </div>
  );
}
