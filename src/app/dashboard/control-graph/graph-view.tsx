"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { X, Share2, Target, ShieldHalf, UserX, Gavel, ArrowRight } from "lucide-react";
import { CG_LENSES, type ControlGraph, type CGUseCase, type EntityKind } from "@/lib/control-graph";
import { buildEstateInsights, type EstateInsight, type InsightIcon } from "@/lib/estate-insights";
import GraphFrame from "@/components/console/graph-frame";
import ControlPictureCard from "@/components/console/control-picture-card";
import type { UCPicture } from "@/server/control-graph/load-pictures";

const INSIGHT_ICON: Record<InsightIcon, typeof Share2> = {
  concentration: Share2, blast: Target, posture: ShieldHalf, owner: UserX, decision: Gavel,
};
const INSIGHT_TINT: Record<string, { color: string; bg: string }> = {
  high: { color: "#ef4444", bg: "#ef44441f" },
  medium: { color: "#d97706", bg: "#f59e0b1f" },
  low: { color: "#3b82f6", bg: "#3b82f61f" },
};

const tierColor = (t: number | null) =>
  t === 1 ? "#22c55e" : t === 2 ? "#84cc16" : t === 3 ? "#f59e0b" : t === 4 ? "#f97316" : t === 5 ? "#ef4444" : "#64748b";

const KIND: Record<EntityKind, { label: string; color: string }> = {
  data: { label: "Data", color: "#3b82f6" },
  model: { label: "Model / AI service", color: "#8b5cf6" },
  system: { label: "System", color: "#14b8a6" },
};

const trunc = (s: string, n = 26) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export default function ControlGraphView({ graph, pictures }: { graph: ControlGraph; pictures: UCPicture[] }) {
  const [sel, setSel] = useState<string | null>(null);
  const [lens, setLens] = useState<string | null>(null);
  const [picked, setPicked] = useState<string>("");
  const [showMap, setShowMap] = useState(false);
  const [focus, setFocus] = useState<{ ids: Set<string>; label: string } | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const estateMapRef = useRef<HTMLDivElement>(null);

  const pictureById = useMemo(() => new Map(pictures.map((p) => [p.id, p])), [pictures]);
  const pickedPic = picked ? pictureById.get(picked) : null;
  const insights = useMemo(() => buildEstateInsights(graph), [graph]);

  const lensFn = CG_LENSES.find((l) => l.key === lens)?.match;
  const matches = (u: CGUseCase) => focus ? focus.ids.has(u.id) : !lensFn || lensFn(u);

  const applyInsight = (ins: EstateInsight) => {
    const a = ins.action;
    if (a.kind === "lens") { setFocus(null); setLens(a.lens); }
    else if (a.kind === "focus") { setLens(null); setFocus({ ids: new Set(a.useCaseIds), label: a.focusLabel }); }
    setTimeout(() => estateMapRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 0);
  };

  const UCX = 16, UCW = 250, ENX = 470, ENW = 220, top = 16, ucH = 70, enH = 44;
  const layout = useMemo(() => {
    const ucY = new Map<string, number>();
    graph.useCases.forEach((u, i) => ucY.set(u.id, top + i * ucH + ucH / 2));
    const enY = new Map<string, number>();
    graph.entities.forEach((e, i) => enY.set(e.key, top + i * enH + enH / 2));
    const height = Math.max(graph.useCases.length * ucH, graph.entities.length * enH) + top * 2;
    const edges: { uc: string; key: string; d: string }[] = [];
    for (const u of graph.useCases) {
      for (const k of u.entityKeys) {
        const y1 = ucY.get(u.id), y2 = enY.get(k);
        if (y1 == null || y2 == null) continue;
        const mx = (UCX + UCW + ENX) / 2;
        edges.push({ uc: u.id, key: k, d: `M ${UCX + UCW} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${ENX} ${y2}` });
      }
    }
    return { ucY, enY, height, edges, width: ENX + ENW + 16 };
  }, [graph]);

  const ucById = useMemo(() => new Map(graph.useCases.map((u) => [u.id, u])), [graph]);
  const selUc = sel ? ucById.get(sel) : null;
  const entityActive = (e: { useCaseIds: string[] }) => (!lensFn && !focus) ? true : e.useCaseIds.some((id) => { const u = ucById.get(id); return u && matches(u); });

  const s = graph.summary;
  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wide text-[#0d9488]">AI Control Graph</div>
        <h1 className="text-[19px] font-bold text-[var(--text)]">Your AI estate, mapped</h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[var(--muted)]">
          Every AI use case and what it touches — data, models, and systems — with its governance state. Use a lens to
          answer a question, or click a use case to open its control neighbourhood.
        </p>
      </div>

      {/* pick a use case to see its Control Picture; default is the estate map */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">View</span>
        <select
          value={picked}
          onChange={(e) => { setPicked(e.target.value); setShowMap(false); }}
          className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1.5 text-[12.5px] text-[var(--text)] outline-none focus:border-[#0d9488]"
        >
          <option value="">All use cases — estate map</option>
          {pictures.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {pickedPic && (
          <button onClick={() => setPicked("")} className="text-[12px] font-semibold text-[var(--muted)] hover:text-[var(--text)]">← Back to estate map</button>
        )}
        <span className="ml-auto text-[12px] text-[var(--faint)]">
          {pickedPic ? "Plain-English control picture for one use case" : "One picture per use case lives here — pick one above"}
        </span>
      </div>

      {pickedPic ? (
        <div>
          <ControlPictureCard
            picture={pickedPic.picture}
            useCaseId={pickedPic.id}
            onSeeMap={() => { setShowMap(true); setTimeout(() => mapRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 0); }}
          />
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <Link href={`/dashboard/use-cases/${pickedPic.id}/perspectives`} className="text-[12px] font-semibold text-[#3b82f6] hover:underline">Perspectives →</Link>
            <Link href={`/dashboard/supply-chain?uc=${pickedPic.id}`} className="text-[12px] font-semibold text-[#3b82f6] hover:underline">Dependency graph →</Link>
            <Link href={`/dashboard/use-cases/${pickedPic.id}`} className="text-[12px] font-semibold text-[#0d9488] hover:underline">Open use case →</Link>
            <Link href={`/dashboard/use-cases/${pickedPic.id}/manage`} className="text-[12px] font-semibold text-[var(--muted)] hover:text-[var(--text)]">Manage →</Link>
          </div>

          {/* the full map — stays inside the Control Graph: this use case's neighbourhood */}
          {showMap && (
            <div ref={mapRef} className="mt-4">
              <UseCaseMap
                u={ucById.get(pickedPic.id)}
                entities={graph.entities.filter((e) => ucById.get(pickedPic.id)?.entityKeys.includes(e.key))}
                onClose={() => setShowMap(false)}
                useCaseId={pickedPic.id}
              />
            </div>
          )}
        </div>
      ) : (
      <>
      {/* what stands out — the estate's own headline, above the tiles + map */}
      {insights.length > 0 && (
        <div className="overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--surface)]">
          <div className="flex items-baseline gap-2 border-b border-[var(--border)] px-4 py-2.5">
            <span className="text-[13px] font-bold text-[var(--text)]">What stands out</span>
            <span className="text-[12px] text-[var(--muted)]">patterns across the whole estate</span>
          </div>
          {insights.map((ins, i) => {
            const Icon = INSIGHT_ICON[ins.icon];
            const t = INSIGHT_TINT[ins.severity];
            return (
              <div key={ins.key} className={`flex items-center gap-3 px-4 py-3 ${i < insights.length - 1 ? "border-b border-[var(--border)]" : ""}`}>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: t.bg, color: t.color }}><Icon size={15} /></span>
                <span className="text-[13.5px] leading-snug text-[var(--text)]">{ins.text}</span>
                {ins.action.kind === "link" ? (
                  <Link href={ins.action.href} className="ml-auto flex items-center gap-1 whitespace-nowrap text-[12px] font-semibold text-[#0d9488] hover:underline">{ins.action.label} <ArrowRight size={12} /></Link>
                ) : (
                  <button onClick={() => applyInsight(ins)} className="ml-auto flex items-center gap-1 whitespace-nowrap text-[12px] font-semibold text-[#0d9488] hover:underline">{ins.action.label} <ArrowRight size={12} /></button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* governance KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Kpi label="Use cases" value={s.total} />
        <Kpi label="Access sensitive data" value={s.sensitive} color={s.sensitive ? "#f97316" : undefined} />
        <Kpi label="Missing evidence" value={s.missingEvidence} color={s.missingEvidence ? "#f59e0b" : undefined} />
        <Kpi label="Tier 4/5, no decision" value={s.highRiskNoDecision} color={s.highRiskNoDecision ? "#ef4444" : undefined} />
        <Kpi label="Open incidents" value={s.openIncidents} color={s.openIncidents ? "#ef4444" : undefined} />
        <Kpi label="Active exceptions" value={s.activeExceptions} color={s.activeExceptions ? "#f59e0b" : undefined} />
      </div>

      <GraphFrame>{(full) => (<>
      {/* lenses */}
      <div ref={estateMapRef} className="flex flex-wrap items-center gap-2 pr-24">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Lens</span>
        {CG_LENSES.map((l) => (
          <button key={l.key} onClick={() => { setFocus(null); setLens(lens === l.key ? null : l.key); }}
            className="rounded-full border px-3 py-1 text-[12px] font-semibold"
            style={{ borderColor: lens === l.key ? "#0d9488" : "var(--border)", color: lens === l.key ? "#0d9488" : "var(--muted)", background: lens === l.key ? "#0d948814" : "transparent" }}>
            {l.label}
          </button>
        ))}
        {lens && <button onClick={() => setLens(null)} className="text-[12px] font-semibold text-[var(--muted)]">Clear ✕</button>}
        {focus && <span className="flex items-center gap-1 rounded-full border border-[#0d9488] bg-[#0d948814] px-3 py-1 text-[12px] font-semibold text-[#0d9488]">{focus.label}<button onClick={() => setFocus(null)} className="ml-0.5" aria-label="clear">{<X size={12} />}</button></span>}
        <span className="ml-auto flex items-center gap-3 text-[11px] text-[var(--muted)]">
          {(Object.keys(KIND) as EntityKind[]).map((k) => (
            <span key={k} className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: KIND[k].color }} />{KIND[k].label}</span>
          ))}
        </span>
      </div>

      {/* graph */}
      <div className="overflow-auto rounded-[12px] border border-[var(--border)] bg-[var(--surface)]" style={{ maxHeight: full ? "calc(100vh - 150px)" : 620 }}>
        {graph.useCases.length === 0 ? (
          <p className="p-6 text-[13px] text-[var(--muted)]">No use cases yet. Run an assessment and the estate map will fill in.</p>
        ) : (
          <svg width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} style={{ minWidth: layout.width }}>
            {layout.edges.map((e, i) => {
              const u = ucById.get(e.uc);
              const on = (!lensFn && !focus) ? true : !!(u && matches(u));
              return <path key={i} d={e.d} fill="none" stroke={on ? "#64748b" : "#64748b"} strokeWidth={1} opacity={on ? 0.35 : 0.06} />;
            })}

            {graph.useCases.map((u) => {
              const y = layout.ucY.get(u.id)!;
              const on = matches(u);
              const tc = tierColor(u.tier);
              return (
                <g key={u.id} transform={`translate(${UCX} ${y - ucH / 2 + 6})`} opacity={on ? 1 : 0.28} style={{ cursor: "pointer" }} onClick={() => setSel(u.id)}>
                  <rect width={UCW} height={ucH - 12} rx={8} fill="var(--panel)" stroke={sel === u.id ? "#0d9488" : "var(--border)"} strokeWidth={sel === u.id ? 2 : 1} />
                  <rect width={4} height={ucH - 12} rx={2} fill={tc} />
                  <text x={14} y={20} fontSize={12.5} fontWeight={600} fill="var(--text)">{trunc(u.name)}</text>
                  <text x={14} y={38} fontSize={10.5} fill="var(--muted)">
                    {u.tier ? `Tier ${u.tier}` : "Untiered"} · {u.controlsImplemented}/{u.controlsRequired} controls
                  </text>
                  <g transform={`translate(14 46)`}>
                    <Dot on={u.sensitive} color="#f97316" label="sensitive" x={0} />
                    <Dot on={u.hasEvidence} color="#16a34a" label="evidence" x={64} />
                    <Dot on={u.decided} color="#3b82f6" label="decided" x={128} />
                  </g>
                </g>
              );
            })}

            {graph.entities.map((e) => {
              const y = layout.enY.get(e.key)!;
              const on = entityActive(e);
              const c = KIND[e.kind].color;
              return (
                <g key={e.key} transform={`translate(${ENX} ${y - enH / 2 + 6})`} opacity={on ? 1 : 0.2}>
                  <rect width={ENW} height={enH - 12} rx={8} fill="var(--panel)" stroke="var(--border)" strokeWidth={1} />
                  <rect width={4} height={enH - 12} rx={2} fill={c} />
                  <text x={14} y={16} fontSize={11.5} fontWeight={600} fill="var(--text)">{trunc(e.name, 24)}</text>
                  <text x={14} y={30} fontSize={10} fill="var(--muted)">{KIND[e.kind].label} · {e.useCaseIds.length} use case{e.useCaseIds.length === 1 ? "" : "s"}</text>
                </g>
              );
            })}
          </svg>
        )}
      </div>
      </>)}</GraphFrame>

      {selUc && <Drawer u={selUc} entityName={(k) => graph.entities.find((e) => e.key === k)?.name ?? k} onClose={() => setSel(null)} />}
      </>
      )}
    </div>
  );
}

/** The "full map" for one use case — stays inside the Control Graph: this use
 *  case's node and the data / models / systems it connects to. The deeper
 *  dependency x-ray (AI-BOM, blast radius) is one link further, in Supply Chain. */
function UseCaseMap({ u, entities, onClose, useCaseId }: { u?: CGUseCase; entities: { key: string; name: string; kind: EntityKind }[]; onClose: () => void; useCaseId: string }) {
  if (!u) return null;
  const UCX = 16, UCW = 250, ENX = 450, ENW = 250, top = 16, enH = 46, ucH = 78;
  const n = entities.length;
  const contentH = Math.max(n * enH, ucH + 20);
  const height = contentH + top * 2;
  const ucCy = top + contentH / 2;
  const enY = (i: number) => top + i * enH + enH / 2;
  const width = ENX + ENW + 16;
  const tc = tierColor(u.tier);
  return (
    <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-2.5">
        <span className="text-[12px] font-bold text-[var(--text)]">The full map — what {trunc(u.name, 26)} touches</span>
        <Link href={`/dashboard/supply-chain?uc=${useCaseId}`} className="ml-auto text-[11.5px] font-semibold text-[#0d9488] hover:underline">Open dependency x-ray →</Link>
        <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--text)]" aria-label="close"><X size={16} /></button>
      </div>
      <div className="overflow-auto p-2" style={{ maxHeight: 460 }}>
        {n === 0 ? (
          <p className="p-4 text-[13px] text-[var(--muted)]">No data, model, or system connections recorded yet for this use case.</p>
        ) : (
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ minWidth: width }}>
            {entities.map((e, i) => {
              const y2 = enY(i); const mx = (UCX + UCW + ENX) / 2;
              return <path key={i} d={`M ${UCX + UCW} ${ucCy} C ${mx} ${ucCy}, ${mx} ${y2}, ${ENX} ${y2}`} fill="none" stroke="#64748b" strokeWidth={1} opacity={0.4} />;
            })}
            <g transform={`translate(${UCX} ${ucCy - ucH / 2})`}>
              <rect width={UCW} height={ucH} rx={8} fill="var(--panel)" stroke="#0d9488" strokeWidth={2} />
              <rect width={4} height={ucH} rx={2} fill={tc} />
              <text x={14} y={22} fontSize={13} fontWeight={600} fill="var(--text)">{trunc(u.name)}</text>
              <text x={14} y={40} fontSize={10.5} fill="var(--muted)">{u.tier ? `Tier ${u.tier}` : "Untiered"} · {u.controlsImplemented}/{u.controlsRequired} controls</text>
              <g transform="translate(14 52)">
                <Dot on={u.sensitive} color="#f97316" label="sensitive" x={0} />
                <Dot on={u.hasEvidence} color="#16a34a" label="evidence" x={64} />
                <Dot on={u.decided} color="#3b82f6" label="decided" x={128} />
              </g>
            </g>
            {entities.map((e, i) => {
              const y = enY(i); const c = KIND[e.kind].color;
              return (
                <g key={e.key} transform={`translate(${ENX} ${y - (enH - 12) / 2})`}>
                  <rect width={ENW} height={enH - 12} rx={8} fill="var(--panel)" stroke="var(--border)" strokeWidth={1} />
                  <rect width={4} height={enH - 12} rx={2} fill={c} />
                  <text x={14} y={16} fontSize={11.5} fontWeight={600} fill="var(--text)">{trunc(e.name, 28)}</text>
                  <text x={14} y={29} fontSize={10} fill="var(--muted)">{KIND[e.kind].label}</text>
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="text-[11px] text-[var(--muted)]">{label}</div>
      <div className="text-[22px] font-bold" style={{ color: color ?? "var(--text)" }}>{value}</div>
    </div>
  );
}

function Dot({ on, color, label, x }: { on: boolean; color: string; label: string; x: number }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <circle cx={4} cy={-3} r={3.5} fill={on ? color : "transparent"} stroke={on ? color : "#64748b"} strokeWidth={1} />
      <text x={13} y={0} fontSize={9.5} fill={on ? "var(--text)" : "var(--faint)"}>{label}</text>
    </g>
  );
}

function Drawer({ u, entityName, onClose }: { u: CGUseCase; entityName: (k: string) => string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative h-full w-full max-w-md overflow-y-auto border-l border-[var(--border)] bg-[var(--bg-elevated)] p-5" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute right-4 top-4 text-[var(--muted)] hover:text-[var(--text)]" aria-label="close"><X size={18} /></button>
        <div className="mb-1 flex items-center gap-2">
          <span className="rounded px-2 py-0.5 text-[11px] font-bold" style={{ color: tierColor(u.tier), background: `${tierColor(u.tier)}1f` }}>{u.tier ? `Tier ${u.tier}` : "Untiered"}</span>
        </div>
        <h2 className="text-[16px] font-bold text-[var(--text)]">{u.name}</h2>

        <Sec label="Ownership & lifecycle">
          <Row k="Lifecycle" v={u.lifecycle ?? "Not set"} warn={!u.lifecycle} />
          <Row k="Technical owner" v={u.technicalOwner ?? "Not set"} warn={!u.technicalOwner} />
          <Row k="Sponsor" v={u.sponsor ?? "Not set"} warn={!u.sponsor} />
        </Sec>

        <Sec label="Governance">
          <Row k="Controls" v={`${u.controlsImplemented} of ${u.controlsRequired} in place`} />
          <Row k="Evidence" v={u.hasEvidence ? "Verified evidence on file" : "No verified evidence"} warn={!u.hasEvidence} />
          <Row k="Decision" v={u.decided ? "Recorded" : "Awaiting decision"} warn={!u.decided} />
          <Row k="Sensitive data" v={u.sensitive ? "Yes — accesses sensitive/regulated data" : "Not detected"} warn={u.sensitive} />
          <Row k="Open exceptions" v={u.openExceptions ? String(u.openExceptions) : "None"} warn={u.openExceptions > 0} />
          <Row k="Open incidents" v={u.openIncidents ? String(u.openIncidents) : "None"} warn={u.openIncidents > 0} />
        </Sec>

        {u.sees.length > 0 && <Sec label="Can see"><Chips items={u.sees} /></Sec>}
        {u.does.length > 0 && <Sec label="Can do"><Chips items={u.does} /></Sec>}
        {u.entityKeys.length > 0 && <Sec label="Connected to"><Chips items={u.entityKeys.map(entityName)} /></Sec>}

        {u.vendors.length > 0 && (
          <Sec label="Third-party AI">
            <div className="flex flex-col gap-1">
              {u.vendors.map((v, i) => {
                const m = v.status === "reviewed" ? { c: "#16a34a", l: "Reviewed" } : v.status === "self" ? { c: "#f59e0b", l: "Self-attested" } : { c: "#ef4444", l: "Not assessed" };
                return (
                  <div key={i} className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1.5">
                    <span className="text-[12px] text-[var(--text)]">{v.name}</span>
                    <span className="ml-auto rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ color: m.c, background: `${m.c}1f` }}>{m.l}</span>
                  </div>
                );
              })}
            </div>
          </Sec>
        )}

        <div className="mt-5 flex flex-col gap-2">
          <Link href={`/dashboard/use-cases/${u.id}`} className="rounded-md bg-[#0d9488] px-3 py-2 text-center text-[12.5px] font-semibold text-white">Open use case</Link>
          <Link href={`/dashboard/supply-chain?uc=${u.id}`} className="rounded-md border border-[var(--border)] px-3 py-2 text-center text-[12.5px] font-semibold text-[var(--text)]">Open Dependency Map →</Link>
        </div>
      </div>
    </div>
  );
}

function Sec({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">{label}</div>
      {children}
    </div>
  );
}
function Row({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[var(--surface-2)] py-1.5">
      <span className="text-[12px] text-[var(--muted)]">{k}</span>
      <span className="text-right text-[12px]" style={{ color: warn ? "#d97706" : "var(--text)" }}>{v}</span>
    </div>
  );
}
function Chips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it, i) => <span key={i} className="rounded border border-[var(--border)] bg-[var(--panel)] px-2 py-0.5 text-[11px] text-[var(--text)]">{it}</span>)}
    </div>
  );
}
