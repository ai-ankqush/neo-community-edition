"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Settings, SlidersHorizontal, Trash2 } from "lucide-react";
import { Card, KPICard, TierBadge, RecBadge, FunctionBadge, Th, Td } from "@/components/console/ui";
import { STAGE_LABELS, STAGES, type Stage } from "@/lib/types/stages";

export interface UCRow {
  id: string;
  name: string;
  stage: string;
  tier: number | null;
  patterns: string[] | null;
  business_function: string | null;
  decision: string | null;
}

export default function UseCasesTable({ rows, isAdmin = false, unlimited = false, consumedIds = [] }: { rows: UCRow[]; isAdmin?: boolean; unlimited?: boolean; consumedIds?: string[] }) {
  const router = useRouter();
  const [fn, setFn] = useState("");
  const [tier, setTier] = useState("");
  const [stage, setStage] = useState("");
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const consumed = useMemo(() => new Set(consumedIds), [consumedIds]);

  useEffect(() => {
    function onClick(e: MouseEvent) { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenu(null); }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function removeUC(id: string, name: string) {
    const isArchive = consumed.has(id) && !unlimited;
    const msg = isArchive
      ? `Archive "${name}"? It has consumed an assessment slot — archiving hides it but the record is kept and the slot stays used until your plan renews.`
      : `Delete "${name}"? No assessment has run yet, so it's removed permanently.`;
    if (!confirm(msg)) return;
    setBusy(id);
    const res = await fetch(`/api/use-cases/${id}`, { method: "DELETE" });
    if (res.ok) { setOpenMenu(null); router.refresh(); }
    else { const j = await res.json().catch(() => ({})); alert(typeof j.error === "string" ? j.error : "Failed"); }
    setBusy(null);
  }

  const functions = useMemo(() => [...new Set(rows.map((r) => r.business_function).filter(Boolean))] as string[], [rows]);
  const usedStages = useMemo(() => STAGES.filter((s) => rows.some((r) => r.stage === s)), [rows]);

  const filtered = rows.filter(
    (r) =>
      (!fn || r.business_function === fn) &&
      (!tier || String(r.tier ?? "") === tier) &&
      (!stage || r.stage === stage)
  );

  const total = rows.length;
  const decided = rows.filter((r) => r.decision).length;
  const inAssessment = total - decided;
  const highRisk = rows.filter((r) => (r.tier ?? 0) >= 4).length;

  const sel = "rounded-md border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1.5 text-[12.5px] text-[var(--text)] outline-none focus:border-[#3b82f6]";
  const active = fn || tier || stage;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
        <KPICard label="Use Cases" value={total} />
        <KPICard label="In Assessment" value={inAssessment} color="#3b82f6" />
        <KPICard label="Decided" value={decided} color="#22c55e" />
        <KPICard label="High Risk (Tier 4–5)" value={highRisk} color="#ef4444" />
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
        <select value={stage} onChange={(e) => setStage(e.target.value)} className={sel}>
          <option value="">All stages</option>
          {usedStages.map((s) => <option key={s} value={s}>{STAGE_LABELS[s as Stage] ?? s}</option>)}
        </select>
        {active && (
          <button onClick={() => { setFn(""); setTier(""); setStage(""); }} className="text-[12px] font-semibold text-[#3b82f6] hover:underline">
            Clear
          </button>
        )}
        <span className="ml-auto text-[12px] text-[var(--faint)]">{filtered.length} of {total}</span>
      </div>

      <Card className="p-0">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead className="bg-[var(--panel)]">
            <tr><Th>Use Case</Th><Th>Function</Th><Th>Patterns</Th><Th>Tier</Th><Th>Stage</Th><Th>Decision</Th><Th> </Th></tr>
          </thead>
          <tbody>
            {filtered.map((uc) => (
              <tr key={uc.id} className="hover:bg-[var(--border)]">
                <Td>
                  <Link href={`/dashboard/use-cases/${uc.id}`} className="font-medium hover:underline">{uc.name}</Link>
                </Td>
                <Td>{uc.business_function ? <FunctionBadge fn={uc.business_function} /> : <span className="text-[#4b5563]">—</span>}</Td>
                <Td className="text-[var(--muted)]">{(uc.patterns ?? []).slice(0, 3).join(" / ") || "—"}</Td>
                <Td>{uc.tier ? <TierBadge tier={uc.tier} /> : <span className="text-[#4b5563]">—</span>}</Td>
                <Td className="text-[var(--muted)]">{STAGE_LABELS[uc.stage as Stage] ?? uc.stage}</Td>
                <Td>{uc.decision ? <RecBadge rec={uc.decision} /> : <span className="text-[var(--faint)]">In assessment</span>}</Td>
                <Td className="text-right">
                  <div className="relative inline-block" ref={openMenu === uc.id ? menuRef : undefined}>
                    <button
                      onClick={() => setOpenMenu(openMenu === uc.id ? null : uc.id)}
                      className="rounded-md p-1.5 text-[var(--muted)] hover:bg-[var(--panel)] hover:text-[var(--text)]"
                      title="Manage" aria-label="Manage use case"
                    >
                      <Settings size={16} />
                    </button>
                    {openMenu === uc.id && (
                      <div className="absolute right-0 top-8 z-30 min-w-[150px] rounded-md border border-[var(--border)] bg-[var(--panel)] p-1 text-left shadow-lg">
                        <Link href={`/dashboard/use-cases/${uc.id}/manage`} className="flex items-center gap-2 rounded px-3 py-1.5 text-[13px] text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--text)]">
                          <SlidersHorizontal size={14} /> Manage
                        </Link>
                        {isAdmin && (
                          <button
                            onClick={() => removeUC(uc.id, uc.name)}
                            disabled={busy === uc.id}
                            className="flex w-full items-center gap-2 rounded px-3 py-1.5 text-left text-[13px] text-[var(--muted)] hover:bg-[var(--border)] hover:text-red-400 disabled:opacity-50"
                          >
                            <Trash2 size={14} /> {busy === uc.id ? "…" : consumed.has(uc.id) && !unlimited ? "Archive" : "Delete"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><Td className="py-10 text-center text-[var(--faint)]" colSpan={7}>
                {total === 0 ? "No use cases yet — create the first one." : "No use cases match this filter."}
              </Td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
