"use client";
import { BRAND } from "@/lib/brand";

/** The AI-native use-case surface: one architecture, many Perspectives.
 *  Switching a perspective TRANSFORMS the whole body — it is not navigation.
 *  Story is the default (Neo narrating the system); the rest re-render the same
 *  Control Picture facts through a single viewpoint. "Lenses, not filters." */

import { useState } from "react";
import Link from "next/link";
import type { ControlPicture, ChipTone, VerdictState } from "@/lib/control-picture";

const VERDICT_C: Record<VerdictState, string> = {
  ready: "#22c55e", conditions: "#3b82f6", not_ready: "#ef4444", needs_decision: "#f59e0b", in_progress: "#8892a4",
};
const CHIP_C: Record<ChipTone, string> = {
  model: "#8b5cf6", data: "#3b82f6", tool: "#14b8a6", vendor_ok: "#22c55e", vendor_warn: "#f59e0b",
};

type P = { key: string; label: string };
const PERSPECTIVES: P[] = [
  { key: "story", label: "Story" },
  { key: "sensitive", label: "Sensitive Data" },
  { key: "blast", label: "Blast Radius" },
  { key: "controls", label: "Missing Controls" },
  { key: "authority", label: "Authority" },
  { key: "reversibility", label: "Reversibility" },
  { key: "evidence", label: "Evidence" },
  { key: "actions", label: "AI Actions" },
];

function Chips({ chips }: { chips: { label: string; tone: ChipTone }[] }) {
  if (!chips.length) return <p className="text-[13px] text-[var(--muted)]">Nothing declared yet.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((c, i) => {
        const col = CHIP_C[c.tone];
        return <span key={i} className="rounded-md px-2.5 py-1 text-[12px] font-medium" style={{ color: col, background: `${col}18`, border: `1px solid ${col}40` }}>{c.label}</span>;
      })}
    </div>
  );
}

function Kicker({ children }: { children: React.ReactNode }) {
  return <div className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#3b82f6]">Through the lens of — {children}</div>;
}
function Lead({ children }: { children: React.ReactNode }) {
  return <p className="max-w-2xl text-[15px] font-medium leading-relaxed text-[var(--text)]">{children}</p>;
}
function Sub({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[var(--muted)]">{children}</p>;
}
function GoLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="text-[12.5px] font-semibold text-[#3b82f6] hover:underline">{children}</Link>;
}

export default function PerspectivesView({
  name, tier, picture, ucId,
}: { name: string; tier: number | null; picture: ControlPicture; ucId: string }) {
  const [active, setActive] = useState("story");
  const { verdict, touches, canDo, couldGoWrong, proof } = picture;
  const vc = VERDICT_C[verdict.state];
  const canAct = canDo.sentence.includes("take actions on its own") && !canDo.sentence.includes("can't take actions");
  const dataChips = touches.chips.filter((c) => c.tone === "data");

  const body = (() => {
    switch (active) {
      case "story":
        return (
          <div>
            <Kicker>the story</Kicker>
            <p className="mb-3 text-[13px] font-semibold" style={{ color: vc }}>{verdict.headline}.</p>
            <Lead>
              {touches.count > 0 ? touches.sentence + " " : ""}{canDo.sentence} {proof.sentence}
            </Lead>
            <div className="mt-4 max-w-2xl rounded-r-[8px] border-l-[3px] border-[#e5484d] bg-[#e5484d10] px-4 py-3">
              <span className="text-[10px] font-bold uppercase tracking-wide text-[#e5484d]">Greatest residual risk</span>
              <p className="mt-1 text-[14px] leading-relaxed text-[var(--text)]">{couldGoWrong.sentence}</p>
              <p className="mt-1 text-[12.5px] text-[var(--muted)]">{couldGoWrong.detail}</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-4">
              <button onClick={() => setActive("blast")} className="text-[12px] font-semibold text-[#3b82f6] hover:underline">See it → Blast Radius</button>
              <button onClick={() => setActive("controls")} className="text-[12px] font-semibold text-[#3b82f6] hover:underline">Fix it → Missing Controls</button>
              <span className="text-[11px] text-[var(--faint)]">Written by {BRAND.name} from this system&apos;s control picture · evidence-linked</span>
            </div>
          </div>
        );
      case "sensitive":
        return (
          <div>
            <Kicker>sensitive data</Kicker>
            <Lead>{dataChips.length ? "This AI can reach the following data sources:" : "No data sources declared for this AI yet."}</Lead>
            <div className="mt-3"><Chips chips={dataChips.length ? dataChips : touches.chips} /></div>
            <Sub>Sensitivity is graded from what it&apos;s classified to <em>see</em>. Connect an integration to verify access live.</Sub>
            <div className="mt-3"><GoLink href={`/dashboard/evidence?uc=${ucId}`}>Verify what it can access →</GoLink></div>
          </div>
        );
      case "blast":
        return (
          <div>
            <Kicker>blast radius</Kicker>
            <Lead>{touches.sentence}</Lead>
            <div className="mt-3"><Chips chips={touches.chips} /></div>
            <Sub>If one of these fails or changes, this use case is affected. {couldGoWrong.sentence}</Sub>
            <div className="mt-3"><GoLink href={`/dashboard/supply-chain?uc=${ucId}`}>Zoom into the dependency graph →</GoLink></div>
          </div>
        );
      case "controls":
        return (
          <div>
            <Kicker>missing controls</Kicker>
            <Lead>{proof.sentence}</Lead>
            <div className="mt-3 flex flex-col gap-2">
              {proof.items.map((it, i) => (
                <div key={i} className="flex items-center gap-2.5 text-[13px]">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: it.ok ? "#22c55e" : "#ef4444" }} />
                  <span className={it.ok ? "text-[var(--text)]" : "text-[var(--muted)]"}>{it.label}</span>
                </div>
              ))}
            </div>
            <div className="mt-4"><GoLink href={`/dashboard/controls?uc=${ucId}`}>Open the controls →</GoLink></div>
          </div>
        );
      case "authority":
        return (
          <div>
            <Kicker>delegated authority</Kicker>
            <Lead>{canDo.sentence}</Lead>
            <Sub>{canDo.detail}</Sub>
            <div className="mt-4">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--faint)]">Built on</div>
              <Chips chips={touches.chips} />
            </div>
          </div>
        );
      case "reversibility":
        return (
          <div>
            <Kicker>reversibility</Kicker>
            {canAct ? (
              <>
                <Lead>This AI can act on its own — so each action needs a way back: reversible, compensatable, or irreversible.</Lead>
                <Sub>Classify its actions and arm the undo path before it runs. Irreversible actions should gate behind a human.</Sub>
                <div className="mt-3"><GoLink href="/dashboard/action-control">Set reversibility in the Action Fabric →</GoLink></div>
              </>
            ) : (
              <Lead>This AI needs a person to take any real action, so there&apos;s little to undo — the risk is a wrong answer, not an irreversible act.</Lead>
            )}
          </div>
        );
      case "evidence":
        return (
          <div>
            <Kicker>evidence</Kicker>
            <Lead>{proof.sentence}</Lead>
            <div className="mt-3 flex flex-col gap-2">
              {proof.items.map((it, i) => (
                <div key={i} className="flex items-center gap-2.5 text-[13px]">
                  <span className="shrink-0 text-[13px]" style={{ color: it.ok ? "#22c55e" : "#8892a4" }}>{it.ok ? "✓" : "○"}</span>
                  <span className={it.ok ? "text-[var(--text)]" : "text-[var(--muted)]"}>{it.label}</span>
                </div>
              ))}
            </div>
            <div className="mt-4"><GoLink href={`/dashboard/evidence?uc=${ucId}`}>Open evidence & verification →</GoLink></div>
          </div>
        );
      case "actions":
        return (
          <div>
            <Kicker>ai actions</Kicker>
            <Lead>{canAct ? "This AI can trigger actions on its own." : "This AI cannot take actions on its own — it drafts or answers, and a person acts."}</Lead>
            <Sub>{canDo.detail}</Sub>
            {canAct && <div className="mt-3"><GoLink href="/dashboard/action-control">Govern its actions in the Action Fabric →</GoLink></div>}
          </div>
        );
      default:
        return null;
    }
  })();

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="mb-1 flex flex-wrap items-center gap-2.5">
        <Link href="/dashboard/control-graph" className="text-[11px] text-[var(--faint)] hover:text-[var(--text)]">AI Control Graph</Link>
        <span className="text-[11px] text-[var(--faint)]">▸</span>
        <h1 className="text-[19px] font-bold text-[var(--text)]">{name}</h1>
        {tier != null && <span className="rounded bg-[#f973161f] px-2 py-0.5 text-[11px] font-bold text-[#f97316]">Risk Tier {tier}</span>}
        <span className="ml-auto rounded px-2.5 py-0.5 text-[11px] font-bold" style={{ background: `${vc}1f`, color: vc }}>{verdict.headline}</span>
      </div>
      <p className="mb-4 text-[12px] text-[var(--faint)]">One system. Switch the perspective — the whole page transforms.</p>

      {/* perspective bar — transformation, not navigation */}
      <div className="flex flex-wrap gap-1.5 border-b border-[var(--border)] pb-4">
        {PERSPECTIVES.map((p) => {
          const on = active === p.key;
          return (
            <button key={p.key} onClick={() => setActive(p.key)}
              className={`rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition-colors ${on ? "border-[#3b82f6] bg-[#12233b] text-[var(--text)]" : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"}`}>
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="pt-6">{body}</div>
    </div>
  );
}
