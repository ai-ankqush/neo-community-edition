"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TierBadge, StatusDot, Th, Td } from "@/components/console/ui";
import { PILLAR_NAMES } from "@/components/console/theme";
import { BRAND } from "@/lib/brand";

// Plain (client-safe) shapes for customer-owned frameworks — the server module is server-only.
export interface CustomFramework { id: string; name: string; authority: string | null }
export interface CustomMapping {
  framework_id: string; scope: "pillar" | "control";
  pillar: number | null; control_id: string | null;
  reference: string; status: "suggested" | "confirmed"; source: "neo" | "human";
}
/** control override wins, else pillar mapping. Mirrors resolveRef in server/frameworks/custom.ts. */
function resolveCustomRef(maps: CustomMapping[], frameworkId: string, pillar: number, controlId: string) {
  const o = maps.find((m) => m.framework_id === frameworkId && m.scope === "control" && m.control_id === controlId);
  if (o) return { reference: o.reference, status: o.status, source: o.source, scope: "control" as const };
  const p = maps.find((m) => m.framework_id === frameworkId && m.scope === "pillar" && m.pillar === pillar);
  if (p) return { reference: p.reference, status: p.status, source: p.source, scope: "pillar" as const };
  return null;
}

const FRAMEWORKS = [
  { key: "nist_ai_rmf", label: "NIST AI RMF" },
  { key: "iso_42001", label: "ISO/IEC 42001" },
  { key: "eu_ai_act", label: "EU AI Act" },
  { key: "owasp_llm", label: "OWASP LLM/Agentic" },
  { key: "sr_11_7", label: "SR 11-7 (Model Risk)" },
  { key: "nydfs_500", label: "NYDFS Part 500" },
] as const;

export interface ControlRow {
  id: string;
  use_case_id: string;
  ucName: string;
  ucTier: number | null;
  pillar: number;
  control: string;
  requirement: string;
  status: string;
  framework_refs: Record<string, string> | null;
  tech: string[];   // the technology the control is configured on (from the declared stack)
  compose?: string | null; // tech with no Neo connector → offer to compose one (Integration Composer)
  connectorReady?: boolean; // a custom connector already exists for this tech → "Verify now"
}

const sel = "rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[12.5px] text-[var(--text)] outline-none focus:border-[#3b82f6]";

export default function ControlsTable({
  rows,
  allCrosswalks = true,
  initialStatus = "",
  initialPillar = "",
  initialUc = "",
  customFrameworks = [],
  customMappings = [],
}: {
  rows: ControlRow[];
  allCrosswalks?: boolean;
  initialStatus?: string;
  initialPillar?: string;
  initialUc?: string;
  customFrameworks?: CustomFramework[];
  customMappings?: CustomMapping[];
}) {
  const router = useRouter();
  const [fw, setFw] = useState<string>("nist_ai_rmf");
  const [ucFilter, setUcFilter] = useState(initialUc);
  const [pillarFilter, setPillarFilter] = useState(initialPillar);
  const [reqFilter, setReqFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<string | null>(null); // controlId being overridden
  const [editVal, setEditVal] = useState("");
  const [savingRow, setSavingRow] = useState<string | null>(null);

  // custom framework keys are prefixed so they don't collide with built-in keys
  const customFw = customFrameworks.find((f) => `custom:${f.id}` === fw) ?? null;
  const fwLabel = customFw ? customFw.name : (FRAMEWORKS.find((f) => f.key === fw)?.label ?? "");
  const builtins = allCrosswalks ? FRAMEWORKS : FRAMEWORKS.slice(0, 1);

  async function saveOverride(controlId: string) {
    if (!customFw || !editVal.trim()) { setEditing(null); return; }
    setSavingRow(controlId);
    await fetch(`/api/frameworks/${customFw.id}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "map", scope: "control", controlId, reference: editVal.trim(), status: "confirmed" }),
    });
    setSavingRow(null); setEditing(null); router.refresh();
  }

  const useCases = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => m.set(r.use_case_id, r.ucName));
    return [...m.entries()];
  }, [rows]);
  const pillars = useMemo(() => [...new Set(rows.map((r) => r.pillar))].sort((a, b) => a - b), [rows]);

  const filtered = rows.filter((r) =>
    (!ucFilter || r.use_case_id === ucFilter) &&
    (!pillarFilter || r.pillar === Number(pillarFilter)) &&
    (!reqFilter || r.requirement === reqFilter) &&
    (!statusFilter || r.status === statusFilter) &&
    (!q.trim() || r.control.toLowerCase().includes(q.toLowerCase()))
  );

  function clear() {
    setUcFilter(""); setPillarFilter(""); setReqFilter(""); setStatusFilter(""); setQ("");
  }
  const anyFilter = ucFilter || pillarFilter || reqFilter || statusFilter || q;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search controls..."
          className="flex-1 min-w-[160px] rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-[12.5px] text-[var(--text)] outline-none focus:border-[#3b82f6]"
        />
        <select value={ucFilter} onChange={(e) => setUcFilter(e.target.value)} className={sel}>
          <option value="">All use cases</option>
          {useCases.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select value={pillarFilter} onChange={(e) => setPillarFilter(e.target.value)} className={sel}>
          <option value="">All pillars</option>
          {pillars.map((p) => <option key={p} value={p}>{p}. {PILLAR_NAMES[p]}</option>)}
        </select>
        <select value={reqFilter} onChange={(e) => setReqFilter(e.target.value)} className={sel}>
          <option value="">All levels</option>
          <option value="required">Required</option>
          <option value="recommended">Recommended</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={sel}>
          <option value="">All statuses</option>
          <option value="in_place">Ready</option>
          <option value="partial">Partial</option>
          <option value="gap">Not Ready</option>
        </select>
        {anyFilter && (
          <button onClick={clear} className="rounded-md border border-[var(--border)] px-2.5 py-1.5 text-[12px] text-[var(--muted)] hover:text-[var(--text)]">
            Clear
          </button>
        )}
        <span className="ml-auto flex items-center gap-2">
          <span className="text-[var(--faint)]">{filtered.length} of {rows.length}</span>
          <span className="text-[var(--faint)]">·</span>
          <span className="text-[var(--faint)]">Framework:</span>
          <select value={fw} onChange={(e) => { setFw(e.target.value); setEditing(null); }} className={sel}>
            <optgroup label="Built-in crosswalks">
              {builtins.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </optgroup>
            {customFrameworks.length > 0 && (
              <optgroup label="Your frameworks">
                {customFrameworks.map((f) => <option key={f.id} value={`custom:${f.id}`}>{f.name}</option>)}
              </optgroup>
            )}
          </select>
        </span>
      </div>
      <div className="overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full table-fixed text-[13px]">
          <colgroup>
            <col className="w-[14%]" /><col className="w-[11%]" /><col className="w-[28%]" />
            <col className="w-[15%]" /><col className="w-[14%]" /><col className="w-[8%]" /><col className="w-[10%]" />
          </colgroup>
          <thead className="bg-[var(--panel)]">
            <tr>
              <Th>Use Case</Th><Th>Pillar</Th><Th>Control</Th><Th>{fwLabel}</Th><Th>Tech</Th><Th>Level</Th><Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const ref = customFw ? undefined : c.framework_refs?.[fw];
              const custom = customFw ? resolveCustomRef(customMappings, customFw.id, c.pillar, c.id) : null;
              const isEditing = editing === c.id;
              return (
                <tr key={c.id} className="hover:bg-[var(--panel-hover)]">
                  <Td className="truncate">
                    <Link href={`/dashboard/use-cases/${c.use_case_id}?tab=controls`} className="hover:underline">
                      {c.ucName}
                    </Link>{" "}
                    {c.ucTier && <TierBadge tier={c.ucTier} />}
                  </Td>
                  <Td className="truncate text-[var(--muted)]">{PILLAR_NAMES[c.pillar]}</Td>
                  <Td className="break-words">{c.control}</Td>
                  <Td className="break-words">
                    {customFw ? (
                      isEditing ? (
                        <span className="flex items-center gap-1">
                          <input autoFocus value={editVal} onChange={(e) => setEditVal(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") saveOverride(c.id); if (e.key === "Escape") setEditing(null); }}
                            placeholder="control id / clause"
                            className="w-full rounded border border-[#0d9488] bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--text)] outline-none" />
                          <button onClick={() => saveOverride(c.id)} disabled={savingRow === c.id}
                            className="rounded bg-[#0d9488] px-1.5 py-0.5 text-[10px] font-bold text-white disabled:opacity-40">✓</button>
                        </span>
                      ) : (
                        <button onClick={() => { setEditing(c.id); setEditVal(custom?.reference ?? ""); }}
                          title={custom ? `${custom.scope === "control" ? "Per-control override" : "From pillar mapping"}${custom.source === "neo" ? ` · ${BRAND.name}-suggested` : ""} — click to override for this control` : "Click to set a reference for this control"}
                          className="group inline-flex items-center gap-1 text-left">
                          {custom ? (
                            <span className={`font-mono text-[11px] ${custom.status === "confirmed" ? "text-[#0d9488]" : "text-[#7c3aed]"}`}>{custom.reference}</span>
                          ) : (
                            <span className="text-[11px] text-[#4b5563]">— set</span>
                          )}
                          {custom?.scope === "control" && <span className="text-[9px] text-[var(--faint)]">·control</span>}
                          {custom?.source === "neo" && custom.status === "suggested" && <span className="text-[9px] text-[#7c3aed]">·{BRAND.name}?</span>}
                        </button>
                      )
                    ) : ref && ref !== "n/a" ? (
                      <span className="font-mono text-[11px] text-[#3b82f6]">{ref}</span>
                    ) : (
                      <span className="text-[#4b5563]">{ref === "n/a" ? "n/a" : "—"}</span>
                    )}
                  </Td>
                  <Td className="break-words">
                    {c.tech.length ? (
                      <span title={`Configure in ${c.tech.join(", ")}`} className="text-[11px] text-[#60a5fa]">
                        {c.tech[0]}
                      </span>
                    ) : (
                      <span className="text-[11px] text-[#4b5563]">—</span>
                    )}
                    {c.compose && (
                      <Link
                        href={`/dashboard/integrations/composer?compose=${encodeURIComponent(c.compose)}`}
                        title={c.connectorReady ? `Verify this control live against your ${c.compose} connector` : `No ${BRAND.name} connector for ${c.compose} — let ${BRAND.name} compose a read-only check`}
                        className="mt-0.5 block text-[10px] font-semibold text-[var(--accent,#06d6d6)] hover:underline"
                      >
                        {c.connectorReady ? "Verify now →" : "Compose connector →"}
                      </Link>
                    )}
                  </Td>
                  <Td className="truncate text-xs text-[var(--muted)]">{c.requirement}</Td>
                  <Td className="whitespace-nowrap"><StatusDot status={c.status} /></Td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <Td className="py-10 text-center text-[var(--faint)]" colSpan={7}>
                  {rows.length === 0
                    ? "No controls selected yet — complete the controls stage on a use case."
                    : "No controls match the current filters."}
                </Td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {customFw ? (
        <p className="text-[11px] text-[#4b5563]">
          Showing <span className="text-[#0d9488]">{customFw.name}</span> — your own framework.
          Values inherit from the pillar mapping; click any reference to set a <span className="text-[var(--text)]">per-control override</span>.
          <span className="text-[#7c3aed]"> Purple</span> = {BRAND.name}-suggested and not yet confirmed. Manage pillar mappings on the{" "}
          <Link href="/dashboard/controls/frameworks" className="text-[#0d9488] hover:underline">frameworks page</Link>.
        </p>
      ) : (
        <p className="text-[11px] text-[#4b5563]">
          — means the control was generated before framework mapping (methodology v1.2). Re-run the
          controls stage to populate crosswalk references.
        </p>
      )}
    </div>
  );
}
