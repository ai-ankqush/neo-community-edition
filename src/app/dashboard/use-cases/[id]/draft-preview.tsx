"use client";

import type { Stage } from "@/lib/types/stages";

/** When the Risk Tier draft is shown as a confirm-or-correct gate, the escalation
 *  triggers become checkboxes the customer confirms; the effective tier recomputes
 *  deterministically from the confirmed triggers. */
export type TriggerState = { checked: Set<string>; onToggle: (id: string) => void; baseTier: number; effectiveTier: number };

/** Elegant, per-stage rendering of an engine proposal (replaces raw JSON). */
export default function DraftPreview({ stage, draft, triggerState }: { stage: Stage; draft: unknown; triggerState?: TriggerState }) {
  if (draft == null) return null;
  const d = draft as Record<string, unknown>;

  return (
    <div className="mt-4 rounded-lg border border-[#3b82f630] bg-[#3b82f60a] p-4">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[#3b82f6]">
        Engine proposal — review before accepting
      </p>
      <div className="space-y-3 text-[13px] text-[var(--text)]">
        {stage === "classify" && <Classify d={d} />}
        {stage === "tier" && <Tier d={d} triggerState={triggerState} />}
        {stage === "questions" && <Questions d={d} />}
        {stage === "controls" && <Controls d={d} />}
        {stage === "evidence" && <Evidence d={d} />}
        {stage === "assurance" && <Assurance d={d} />}
        {stage === "decision" && <Decision d={d} />}
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--faint)]">{children}</p>;
}
function Chips({ items, color = "#3b82f6" }: { items: unknown[]; color?: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((x, i) => (
        <span key={i} className="rounded-full px-2.5 py-0.5 text-[12px]"
          style={{ color, background: `${color}1a`, border: `1px solid ${color}33` }}>
          {String(x)}
        </span>
      ))}
    </div>
  );
}
function Bullets({ items }: { items: unknown[] }) {
  return (
    <ul className="space-y-1 text-[var(--muted)]">
      {items.map((x, i) => <li key={i} className="flex gap-2"><span className="text-[#3b82f6]">•</span>{String(x)}</li>)}
    </ul>
  );
}

function Classify({ d }: { d: Record<string, unknown> }) {
  const arr = (k: string) => (Array.isArray(d[k]) ? (d[k] as unknown[]) : []);
  return (
    <>
      <div><Label>Patterns</Label><Chips items={arr("patterns")} /></div>
      <div className="grid grid-cols-3 gap-3">
        <div><Label>See</Label><Bullets items={arr("see")} /></div>
        <div><Label>Decide</Label><Bullets items={arr("decide")} /></div>
        <div><Label>Do</Label><Bullets items={arr("do")} /></div>
      </div>
      <div><Label>Autonomy</Label><span className="text-lg font-bold">{String(d.autonomyLevel ?? "—")}</span><span className="text-[var(--faint)]"> / 5</span></div>
      {d.rationale ? <div><Label>Rationale</Label><p className="leading-relaxed text-[var(--muted)]">{String(d.rationale)}</p></div> : null}
      {arr("openQuestions").length > 0 && <div><Label>Open questions</Label><Bullets items={arr("openQuestions")} /></div>}
    </>
  );
}

function Tier({ d, triggerState }: { d: Record<string, unknown>; triggerState?: TriggerState }) {
  const arr = (k: string) => (Array.isArray(d[k]) ? (d[k] as unknown[]) : []);
  const tierColor: Record<number, string> = { 1: "#22c55e", 2: "#3b82f6", 3: "#f59e0b", 4: "#f97316", 5: "#ef4444" };
  const baseT = Number(d.tier);
  const shownT = triggerState ? triggerState.effectiveTier : baseT;
  const bumped = triggerState ? triggerState.effectiveTier > triggerState.baseTier : false;
  const triggers = arr("escalationTriggers") as Record<string, unknown>[];
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded px-3 py-1 text-sm font-bold"
          style={{ color: tierColor[shownT], background: `${tierColor[shownT]}1f`, border: `1px solid ${tierColor[shownT]}40` }}>
          TIER {shownT}
        </span>
        {bumped && <span className="text-[11px] text-[var(--faint)]">base Tier {triggerState!.baseTier} · raised by confirmed triggers</span>}
        {d.punchline ? <span className="text-[13px] italic text-[var(--text)]">{String(d.punchline)}</span> : null}
      </div>
      {d.rationale ? <div><Label>Rationale</Label><p className="leading-relaxed text-[var(--muted)]">{String(d.rationale)}</p></div> : null}
      {arr("riskDrivers").length > 0 && (
        <div><Label>Risk drivers</Label>
          <div className="space-y-1">
            {(arr("riskDrivers") as Record<string, unknown>[]).map((r, i) =>
              typeof r === "object" && r?.area ? (
                <div key={i} className="flex items-center justify-between border-b border-[var(--border)] pb-1">
                  <span className="text-[var(--text)]">{String(r.area)} <span className="text-[var(--faint)]">— {String(r.reason ?? "")}</span></span>
                  <span className="text-xs font-bold text-[#f59e0b]">{String(r.rating ?? "")}</span>
                </div>
              ) : <div key={i} className="text-[var(--muted)]">• {String(r)}</div>
            )}
          </div>
        </div>
      )}
      {triggers.length > 0 && (
        <div><Label>Escalation triggers{triggerState ? " — confirm which are true" : ""}</Label>
          <div className="space-y-1">
            {triggers.map((t2, i) => {
              const tid = String(t2.id ?? i);
              const row = (
                <>
                  <span className="font-mono text-[var(--faint)]">{String(t2.id ?? "")}</span>
                  <span className="flex-1 text-[var(--text)]">{String(t2.trigger ?? "")}</span>
                  <span className="text-[#f97316]">→ Tier {String(t2.newTier ?? "")}</span>
                </>
              );
              return triggerState ? (
                <label key={i} className="flex cursor-pointer items-center gap-2 rounded border border-[var(--border)] bg-[var(--panel)] px-2 py-1.5 text-[12.5px] hover:border-[#3b82f660]">
                  <input type="checkbox" checked={triggerState.checked.has(tid)} onChange={() => triggerState.onToggle(tid)} className="accent-[#3b82f6]" />
                  {row}
                </label>
              ) : (
                <div key={i} className="flex gap-2 text-[12.5px]">{row}</div>
              );
            })}
          </div>
          {triggerState && (
            <p className="mt-2 text-[11px] text-[var(--faint)]">
              {bumped
                ? <>Confirmed triggers raise this to <b className="text-[#f97316]">Tier {triggerState.effectiveTier}</b>. Confirming records it as your decision.</>
                : "Check any that are true for your use case — the risk tier updates automatically."}
            </p>
          )}
        </div>
      )}
    </>
  );
}

function Questions({ d }: { d: Record<string, unknown> }) {
  const qs = (Array.isArray(d.questions) ? d.questions : []) as Record<string, unknown>[];
  return (
    <div>
      <Label>{qs.length} tailored questions</Label>
      <div className="space-y-2">
        {qs.map((q, i) => (
          <div key={i} className="rounded border border-[var(--border)] bg-[var(--panel)] p-2.5">
            <div className="flex items-start gap-2">
              {q.blocking ? <span className="mt-0.5 text-[10px] font-bold text-[#ef4444]">BLOCKING</span> : null}
              <span className="flex-1 text-[var(--text)]">{String(q.question ?? "")}</span>
            </div>
            {q.why ? <p className="mt-1 text-xs text-[var(--faint)]">{String(q.why)}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function Controls({ d }: { d: Record<string, unknown> }) {
  const cs = (Array.isArray(d.controls) ? d.controls : []) as Record<string, unknown>[];
  return (
    <div>
      <Label>{cs.length} controls selected</Label>
      <div className="space-y-1.5">
        {cs.map((c, i) => (
          <div key={i} className="rounded border border-[var(--border)] bg-[var(--panel)] p-2.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[var(--faint)]">P{String(c.pillar ?? "")}</span>
              <span className="flex-1 font-medium text-[var(--text)]">{String(c.control ?? "")}</span>
              <span className="text-[10px] uppercase text-[var(--muted)]">{String(c.requirement ?? "")}</span>
            </div>
            {c.stackImplementation ? <p className="mt-1 text-xs text-[var(--muted)]">{String(c.stackImplementation)}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function Evidence({ d }: { d: Record<string, unknown> }) {
  const items = (Array.isArray(d.evidenceRequests) ? d.evidenceRequests : []) as Record<string, unknown>[];
  return (
    <div>
      <Label>{items.length} evidence requests</Label>
      <div className="space-y-1">
        {items.map((e, i) => (
          <div key={i} className="flex gap-2">
            {e.blocking ? <span className="text-[10px] font-bold text-[#ef4444]">REQ</span> : <span className="text-[#3b82f6]">•</span>}
            <span className="text-[var(--text)]">{String(e.item ?? "")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Assurance({ d }: { d: Record<string, unknown> }) {
  const tests = (Array.isArray(d.tests) ? d.tests : []) as Record<string, unknown>[];
  return (
    <div>
      <Label>{tests.length} assurance tests</Label>
      <div className="space-y-1.5">
        {tests.map((t, i) => (
          <div key={i} className="rounded border border-[var(--border)] bg-[var(--panel)] p-2.5">
            <p className="font-medium text-[var(--text)]">{String(t.objective ?? "")}</p>
            {t.method ? <p className="mt-0.5 text-xs text-[var(--muted)]">{String(t.method)}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function Decision({ d }: { d: Record<string, unknown> }) {
  const conditions = (Array.isArray(d.conditions) ? d.conditions : []) as Record<string, unknown>[];
  return (
    <>
      <div><Label>Recommended decision</Label>
        <span className="rounded bg-[#3b82f61f] px-2.5 py-1 text-[13px] font-bold text-[#3b82f6]">
          {String(d.recommendation ?? "").replaceAll("_", " ")}
        </span>
      </div>
      {d.executiveRationale ? <div><Label>Executive rationale</Label><p className="leading-relaxed text-[var(--muted)]">{String(d.executiveRationale)}</p></div> : null}
      {conditions.length > 0 && (
        <div><Label>Conditions</Label>
          <div className="space-y-1">
            {conditions.map((c, i) => (
              <div key={i} className="flex gap-2"><span className="text-[#f59e0b]">⚑</span>
                <span className="text-[var(--text)]">{String(c.condition ?? "")}</span>
                {c.due ? <span className="text-xs text-[var(--faint)]">({String(c.due)})</span> : null}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
