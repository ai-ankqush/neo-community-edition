"use client";

import { useState } from "react";
import { fastestWins, redTeamSummary, type RedTeamPath, type ControlStatus, type EdgeResidual } from "@/lib/red-team-v2";
import { BRAND } from "@/lib/brand";

const APPLIC: Record<string, { c: string; t: string }> = { strong: { c: "#e5484d", t: "Strongly applicable" }, moderate: { c: "#f59e0b", t: "Moderately applicable" }, weak: { c: "#64748b", t: "Weakly applicable" } };
const IMPACT_C: Record<string, string> = { low: "#22c55e", moderate: "#84cc16", high: "#f59e0b", critical: "#ef4444" };
const RES_C: Record<EdgeResidual, string> = { open: "#e5484d", reduced: "#f59e0b", detected: "#378add", blocked: "#22c55e" };
const RES_LABEL: Record<EdgeResidual, string> = { open: "open", reduced: "reduced", detected: "detected only", blocked: "blocked" };
const STATUS_C: Record<ControlStatus, string> = { verified: "#22c55e", partial: "#84cc16", recommended: "#f59e0b", missing: "#64748b" };
const STATUS_LABEL: Record<ControlStatus, string> = { verified: "verified", partial: "partial", recommended: "recommended", missing: "missing" };
const TONE_C: Record<string, string> = { open: "#e5484d", partial: "#f59e0b", reduced: "#84cc16", blocked: "#22c55e" };

function Info({ text }: { text: string }) {
  return <span title={text} className="ml-1 inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-[var(--border)] text-[9px] font-bold text-[var(--muted)]" aria-label={text}>i</span>;
}

export default function RedTeamV2List({ paths }: { paths: RedTeamPath[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set()); // collapsed by default
  if (!paths.length) return null;
  const s = redTeamSummary(paths);
  const toggle = (id: string) => setOpen((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-[12px] border border-[#e5484d40] bg-[#e5484d0a] px-4 py-3">
        <div className="text-[13px] text-[var(--text)]">
          {BRAND.name} found <b>{s.total}</b> grounded attack path{s.total === 1 ? "" : "s"} for this use case — <b className="text-[#e5484d]">{s.strong}</b> strongly applicable, <b>{s.reachSensitive}</b> reaching sensitive data, <b>{s.reachAction}</b> reaching an action.
        </div>
        <div className="mt-1 text-[11.5px] text-[var(--muted)]">Each path is grounded in your real authority graph — a step is only &ldquo;blocked&rdquo; when the breaking control is actually verified.</div>
      </div>

      {paths.map((p) => {
        const isOpen = open.has(p.id);
        const a = APPLIC[p.applicability];
        return (
          <div key={p.id} className="rounded-[12px] border border-[var(--border)] bg-[var(--surface)]">
            <button onClick={() => toggle(p.id)} className="flex w-full flex-wrap items-center gap-2 px-4 py-3 text-left">
              <span className="w-3 text-center text-[15px] font-bold leading-none text-[var(--muted)]">{isOpen ? "−" : "+"}</span>
              <span className="rounded px-2 py-0.5 text-[10px] font-bold" style={{ background: `${a.c}1f`, color: a.c }}>{p.applicability}</span>
              <span className="text-[13.5px] font-bold text-[var(--text)]">{p.title}</span>
              <span className="text-[11px] text-[var(--faint)]">{p.category}</span>
              <span className="ml-auto rounded px-2 py-0.5 text-[11px] font-bold" style={{ background: `${TONE_C[p.residual.tone]}1f`, color: TONE_C[p.residual.tone] }}>{p.residual.label}</span>
            </button>
            {isOpen && <PathBody path={p} />}
          </div>
        );
      })}
    </div>
  );
}

function PathBody({ path }: { path: RedTeamPath }) {
  const [after, setAfter] = useState(false);
  const wins = fastestWins(path);
  const residual = after ? path.residualAfter : path.residual;

  return (
    <div className="border-t border-[var(--border)]">
      <div className="flex flex-wrap items-center gap-1.5 px-4 pt-2.5 text-[10.5px]">
        <span className="rounded px-1.5 py-0.5 font-bold capitalize" style={{ background: `${IMPACT_C[path.impact]}1f`, color: IMPACT_C[path.impact] }}>{path.impact} impact</span>
        <span className="text-[var(--muted)]">{path.objective}</span>
        {path.owasp.map((o) => <span key={o} className="rounded border border-[var(--border)] px-1.5 py-0.5 font-semibold text-[var(--muted)]">OWASP {o}</span>)}
        {path.atlas.map((x) => <span key={x} className="rounded border border-[var(--border)] px-1.5 py-0.5 font-semibold text-[var(--muted)]">MITRE {x}</span>)}
      </div>

      {/* path strip */}
      <div className="overflow-x-auto px-4 py-3">
        <div className="flex items-stretch gap-1" style={{ minWidth: `${path.nodes.length * 165}px` }}>
          {path.nodes.map((n, i) => {
            const edge = path.edges[i];
            const res = edge ? (after ? edge.residualAfter : edge.residual) : null;
            return (
              <div key={n.id} className="flex items-stretch gap-1">
                <div className="flex w-[150px] shrink-0 flex-col justify-center rounded-[9px] border bg-[var(--panel)] px-2.5 py-2" style={n.placeholder ? { borderColor: "#f59e0b80", borderStyle: "dashed" } : { borderColor: "var(--border)" }}>
                  <div className="text-[9px] font-bold uppercase tracking-wide text-[var(--faint)]">{n.role}</div>
                  <div className="truncate text-[12px] font-semibold text-[var(--text)]" title={n.name}>{n.name}</div>
                </div>
                {edge && res && (
                  <div className="flex w-[150px] shrink-0 flex-col justify-center px-1">
                    <div className="flex items-center gap-1"><span className="h-[2px] flex-1 rounded" style={{ background: RES_C[res] }} /><span className="text-[13px] font-bold" style={{ color: RES_C[res] }}>→</span></div>
                    <div className="mt-0.5 text-center text-[9px] font-semibold" style={{ color: RES_C[res] }}>{edge.label} · {RES_LABEL[res]}</div>
                    <div className="mt-1 flex flex-wrap justify-center gap-0.5">
                      {edge.controls.map((c) => (
                        <span key={c.key} title={`${c.label} — ${c.effect}, ${STATUS_LABEL[c.status]}`} className="rounded px-1 py-[1px] text-[8.5px] font-semibold" style={{ background: `${STATUS_C[c.status]}22`, color: STATUS_C[c.status] }}>
                          {c.effect === "breaks" ? "⛔" : c.effect === "detects" ? "👁" : "▽"} {STATUS_LABEL[c.status]}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] px-4 py-2.5">
        <span className="text-[12px] text-[var(--muted)]">Residual{after ? " (projected)" : ""}<Info text="A step is only 'blocked' when the breaking control is actually verified — recommended-but-unproven controls don't count." /></span>
        <span className="rounded px-2 py-0.5 text-[12px] font-bold" style={{ background: `${TONE_C[residual.tone]}1f`, color: TONE_C[residual.tone] }}>{residual.label}</span>
        <button onClick={() => setAfter((v) => !v)} className="ml-auto rounded-md border border-[var(--accent,#06d6d6)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--accent,#06d6d6)]">{after ? "← Show current state" : "Preview: if these controls were verified →"}</button>
      </div>
      {after && <p className="-mt-1 px-4 pb-1 text-[11px] text-[var(--faint)]">Projection only — shows the residual if the recommended controls were implemented and verified. Nothing is applied or changed.</p>}

      <div className="grid gap-3 border-t border-[var(--border)] px-4 py-3 md:grid-cols-2">
        <div>
          <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-[var(--faint)]">Why this applies</div>
          <p className="text-[12.5px] leading-relaxed text-[var(--text)]">{path.whyApplies}</p>
        </div>
        <div>
          <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-[var(--faint)]">What the attacker gets</div>
          <div className="flex flex-col gap-1">
            {path.attackerGets.map((x, i) => <div key={i} className="flex items-start gap-1.5 text-[12.5px] text-[var(--text)]"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#e5484d]" />{x}</div>)}
          </div>
        </div>
      </div>

      <div className="border-t border-[var(--border)] px-4 py-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <div className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--faint)]">Controls that break this path — proof, not paperwork</div>
          <span className="ml-auto text-[11px] text-[var(--muted)]"><b className="text-[#22c55e]">{path.counts.verified}</b> verified · <b className="text-[#f59e0b]">{path.counts.recommended + path.counts.partial}</b> recommended · <b className="text-[var(--muted)]">{path.counts.missing}</b> missing</span>
        </div>
        <div className="flex flex-col gap-1.5">
          {path.controls.map((c) => (
            <div key={c.key} className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_C[c.status] }} />
              <span className="text-[12.5px] text-[var(--text)]">{c.label}</span>
              <span className="text-[11px] text-[var(--faint)]">— {c.effect === "breaks" ? "breaks the chain" : c.effect === "detects" ? "detects, not prevents" : "reduces"}</span>
              <span className="ml-auto rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ background: `${STATUS_C[c.status]}1f`, color: STATUS_C[c.status] }}>{STATUS_LABEL[c.status]}</span>
            </div>
          ))}
        </div>
      </div>

      {wins.length > 0 && (
        <div className="border-t border-[var(--border)] px-4 py-3">
          <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-[#06d6d6]">Fastest control wins</div>
          <div className="flex flex-col gap-1">
            {wins.map((w, i) => <div key={i} className="flex items-center gap-2 text-[12.5px] text-[var(--text)]"><span className="font-bold text-[#06d6d6]">{i + 1}.</span>{w.label}<span className="ml-auto text-[11px] text-[var(--muted)]">closes {w.closes} open step{w.closes === 1 ? "" : "s"}</span></div>)}
          </div>
        </div>
      )}
      <div className="border-t border-[var(--border)] px-4 py-2 text-[11px] text-[var(--muted)]"><b className="text-[#06d6d6]">What to do:</b> {path.recommendation}</div>
    </div>
  );
}
