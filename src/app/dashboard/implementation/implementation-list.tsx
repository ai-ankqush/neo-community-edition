"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Card, KPICard, TierBadge, FunctionBadge } from "@/components/console/ui";
import DownloadPack from "../use-cases/[id]/download-pack";
import GenerateArtifacts from "../use-cases/[id]/generate-artifacts";

export interface DeployRow {
  id: string;
  name: string;
  tier: number | null;
  business_function: string | null;
  total: number;
  withArtifact: number;
  preventCount: number;
  detectCount: number;
  freshState: "none" | "stale" | "fresh";
  freshLabel: string | null;
  activeJobId: string | null;
  packReady: boolean;
}

const TABS = [
  { key: "prevent", label: "Prevent", noun: "prevention artifact", blurb: "Controls engineering builds into the stack — Terraform, policy-as-code, and config." },
  { key: "detect", label: "Detect", noun: "detection rule", blurb: "Controls security operations deploys to the SIEM — detection rules that alert when something slips." },
] as const;

export default function ImplementationList({
  rows,
  canGenerate,
}: {
  rows: DeployRow[];
  canGenerate: boolean;
}) {
  const [tab, setTab] = useState<"prevent" | "detect">("prevent");
  const [fn, setFn] = useState("");
  const [tier, setTier] = useState("");
  const [status, setStatus] = useState("");

  const meta = TABS.find((t) => t.key === tab)!;
  const countOf = (r: DeployRow) => (tab === "prevent" ? r.preventCount : r.detectCount);

  const functions = useMemo(
    () => [...new Set(rows.map((r) => r.business_function).filter(Boolean))] as string[],
    [rows]
  );

  const filtered = rows.filter(
    (r) =>
      (!fn || r.business_function === fn) &&
      (!tier || String(r.tier ?? "") === tier) &&
      (!status || r.freshState === status)
  );

  const readyCount = rows.length;
  const totalControls = rows.reduce((s, r) => s + r.total, 0);
  const categoryTotal = rows.reduce((s, r) => s + countOf(r), 0);
  const outOfDate = rows.filter((r) => r.freshState === "stale").length;

  const sel = "rounded-md border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1.5 text-[12.5px] text-[var(--text)] outline-none focus:border-[#3b82f6]";
  const active = fn || tier || status;

  return (
    <div className="flex flex-col gap-4">
      {/* Prevent / Detect tabs */}
      <div className="flex gap-0.5 rounded-lg bg-[var(--panel)] p-[3px]">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-md px-3 py-2 text-xs ${tab === t.key ? "bg-[var(--surface)] font-semibold text-[var(--text)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--text)]"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="-mt-1 text-[12px] text-[var(--faint)]">{meta.blurb}</p>

      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
        <KPICard label="Use Cases Ready" value={readyCount} />
        <KPICard label="Total Controls" value={totalControls} color="#3b82f6" />
        <KPICard label={tab === "prevent" ? "Prevention Artifacts" : "Detection Rules"} value={categoryTotal} color="#22c55e" />
        <KPICard label="Out of Date" value={outOfDate} color={outOfDate > 0 ? "#f59e0b" : "var(--text)"} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select value={fn} onChange={(e) => setFn(e.target.value)} className={sel}>
          <option value="">All functions</option>
          {functions.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <select value={tier} onChange={(e) => setTier(e.target.value)} className={sel}>
          <option value="">All tiers</option>
          {[1, 2, 3, 4, 5].map((t) => <option key={t} value={String(t)}>Tier {t}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={sel}>
          <option value="">All code status</option>
          <option value="fresh">Up to date</option>
          <option value="stale">Out of date</option>
          <option value="none">No code yet</option>
        </select>
        {active && (
          <button onClick={() => { setFn(""); setTier(""); setStatus(""); }} className="text-[12px] font-semibold text-[#3b82f6] hover:underline">
            Clear
          </button>
        )}
        <span className="ml-auto text-[12px] text-[var(--faint)]">{filtered.length} of {readyCount}</span>
      </div>

      {filtered.map((r) => {
        const n = countOf(r);
        return (
          <Card key={r.id} className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/dashboard/use-cases/${r.id}`} className="truncate text-[14px] font-semibold text-[var(--text)] hover:text-[#3b82f6]">
                  {r.name}
                </Link>
                {r.business_function && <FunctionBadge fn={r.business_function} />}
                {r.tier && <TierBadge tier={r.tier} />}
                {r.freshState === "fresh" && (
                  <span className="rounded-full bg-[#22c55e1a] px-2 py-0.5 text-[10px] font-semibold text-[var(--good)]">Up to date</span>
                )}
                {r.freshState === "stale" && (
                  <span className="rounded-full bg-[#f59e0b1a] px-2 py-0.5 text-[10px] font-semibold text-[#f59e0b]">Out of date</span>
                )}
              </div>
              <p className="mt-1 text-[12px] text-[var(--faint)]">
                <span className="font-semibold text-[var(--muted)]">{n} {meta.noun}{n === 1 ? "" : "s"}</span>
                {" · "}{r.total} control{r.total === 1 ? "" : "s"} total
                {r.withArtifact === 0 && <span> · not generated yet</span>}
              </p>
            </div>
            <div className="flex shrink-0 items-start gap-2">
              {canGenerate && <GenerateArtifacts useCaseId={r.id} count={r.withArtifact} activeJobId={r.activeJobId} />}
              <DownloadPack useCaseId={r.id} ready={r.packReady} withCode={r.withArtifact > 0} />
            </div>
          </Card>
        );
      })}

      {filtered.length === 0 && (
        <Card>
          <p className="text-[13px] text-[var(--muted)]">
            {readyCount === 0
              ? "No use case has completed the Controls stage yet. Run an assessment through to controls, then come back here to hand it to engineering."
              : "No use cases match this filter."}
          </p>
        </Card>
      )}
    </div>
  );
}
