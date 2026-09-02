"use client";
import { BRAND } from "@/lib/brand";

/** StoryFlow — the "pop-up book" for Story Mode. Neo's reasoning unfolds down a
 *  glowing vertical spine: numbered nodes, a rail that draws in and warms from blue
 *  toward the red residual-risk terminal (which pulses). Grounded steps in. */

export default function StoryFlow({
  steps, residual, loading, thinking = `${BRAND.name} is reading the system…`,
}: { steps: string[]; residual?: string | null; loading?: boolean; thinking?: string }) {
  if (loading) {
    return (
      <div className="flex items-center gap-3">
        <span className="h-7 w-7 shrink-0 animate-pulse rounded-full border-2 border-[#3b82f6]/50 bg-[#3b82f6]/20" />
        <p className="animate-pulse text-[14.5px] text-[var(--muted)]">{thinking}</p>
      </div>
    );
  }
  if (!steps || steps.length === 0) return null;

  const items = [
    ...steps.map((t) => ({ t, risk: false })),
    ...(residual ? [{ t: residual, risk: true }] : []),
  ];
  const STEP_COLS = ["#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#d97706", "#ea580c"];
  const colOf = (i: number, risk: boolean) => (risk ? "#ef4444" : STEP_COLS[Math.min(i, STEP_COLS.length - 1)]);
  const pop = (i: number, extra = 0) => ({ opacity: 0, animation: "sfPop .5s cubic-bezier(.2,.7,.2,1) forwards", animationDelay: `${i * 0.42 + extra}s` } as const);
  const rail = (i: number) => ({ transformOrigin: "top", transform: "scaleY(0)", animation: "sfRail .42s ease forwards", animationDelay: `${i * 0.42 + 0.2}s` } as const);

  return (
    <div className="max-w-2xl">
      <style dangerouslySetInnerHTML={{ __html:
        "@keyframes sfPop{from{opacity:0;transform:translateY(14px) scale(.96)}to{opacity:1;transform:none}}" +
        "@keyframes sfRail{from{transform:scaleY(0)}to{transform:scaleY(1)}}" +
        "@keyframes sfPulse{0%,100%{box-shadow:0 0 0 0 #ef444455}70%{box-shadow:0 0 0 9px #ef444400}}"
      }} />
      {items.map((it, i) => {
        const last = i === items.length - 1;
        const c = colOf(i, it.risk);
        const nextC = last ? c : colOf(i + 1, items[i + 1].risk);
        return (
          <div key={i} className="flex gap-4">
            {/* spine: glowing node + a rail that draws in */}
            <div className="flex w-7 flex-col items-center">
              <span
                style={{ ...pop(i), background: `${c}22`, borderColor: c, color: c, boxShadow: `0 0 0 5px ${c}12`, ...(it.risk ? { animation: `sfPop .5s cubic-bezier(.2,.7,.2,1) forwards, sfPulse 2.2s 1.2s ease-in-out infinite` } : {}) }}
                className="z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-[12px] font-bold">
                {it.risk ? "!" : i + 1}
              </span>
              {!last && <span className="w-[3px] flex-1 rounded-full" style={{ ...rail(i), background: `linear-gradient(${c}, ${nextC})` }} />}
            </div>
            {/* card — risk gets a warm wash; steps get a hairline tint of their node colour */}
            <div
              style={it.risk
                ? { ...pop(i), borderColor: "#ef444480", background: "linear-gradient(180deg,#ef444414,#ef44440a)" }
                : { ...pop(i), borderColor: `${c}40`, background: "var(--surface)" }}
              className="mb-3.5 min-w-0 flex-1 rounded-[11px] border px-4 py-3.5">
              {it.risk && <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[#ef4444]">Greatest residual risk</div>}
              <p className={`text-[14.5px] leading-relaxed text-[var(--text)] ${it.risk ? "font-medium" : ""}`}>{it.t}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
