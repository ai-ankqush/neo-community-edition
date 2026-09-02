"use client";

import type { ReactNode } from "react";
import { BRAND } from "@/lib/brand";
import { CLERK_ACTIVE } from "@/ce/auth-ui";

// Community Edition (no Clerk key) wears the Neo brand; the hosted Sky portal keeps its Gravity identity.
const CE = !CLERK_ACTIVE;
const brandLogo = CE ? BRAND.logoUrl : "/neo-gravity-mark.svg";
const brandName = CE ? BRAND.name : "Neo";

/**
 * The Sky auth experience, in the locked DAWN identity — light by mandate.
 *
 * The scene is the "draw inward": an orbital plane seen at EYE LEVEL (heavily foreshortened ellipses, not a
 * top-down diagram), with particles drifting from the far edges and falling into a luminous core. Gravity
 * here is attraction — the reason everything gravitates toward the centre — not planets circling a hub.
 * Depth comes from luminosity on warm linen; nothing goes dark.
 */
export default function AuthShell({ heading, subtitle, children }: { heading: string; subtitle: string; children: ReactNode }) {
  return (
    <div className={`fixed inset-0 z-30 grid overflow-auto bg-[var(--bg)] ${CE ? "" : "lg:grid-cols-[1.05fr_0.95fr]"}`}>
      <style>{`
        @keyframes corepulse { 0%,100%{opacity:.5;transform:scale(1)} 50%{opacity:.9;transform:scale(1.12)} }
        @keyframes arcbreathe { 0%,100%{opacity:1} 50%{opacity:.72} }
        @keyframes rise { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes drift { 0%{opacity:0} 16%{opacity:.85} 84%{opacity:.6} 100%{transform:translate(0,0);opacity:0} }
      `}</style>

      {!CE && <Scene />}

      <div className="flex min-h-full items-center justify-center px-6 py-10 lg:px-14">
        <div className="w-full max-w-[380px]" style={{ animation: "rise .5s ease both" }}>
          <div className="mb-8 flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={brandLogo} alt={brandName} width={54} height={54} className="h-[54px] w-auto max-w-[160px] object-contain" />
            <span className="text-[18px] font-extrabold tracking-tight text-[var(--text)]">{brandName}</span>
          </div>
          <h1 className="text-[24px] font-bold leading-tight tracking-tight text-[var(--text)]">{heading}</h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--muted)]">{subtitle}</p>
          <div className="mt-7">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** Particles falling inward along the plane — each starts far out and ends at the core. */
const DRIFT: { x: number; y: number; r: number; dur: number; delay: number; fill: string }[] = [
  { x: -278, y: -6, r: 2.6, dur: 13, delay: 0, fill: "#5D53E0" },
  { x: -214, y: 12, r: 2.2, dur: 11, delay: 1.6, fill: "#7C7768" },
  { x: -150, y: -16, r: 1.9, dur: 9.5, delay: 3.1, fill: "#EE7548" },
  { x: 278, y: 9, r: 2.6, dur: 12.5, delay: 0.8, fill: "#5D53E0" },
  { x: 214, y: -11, r: 2.2, dur: 10.5, delay: 2.4, fill: "#7C7768" },
  { x: 150, y: 15, r: 1.9, dur: 9, delay: 4.2, fill: "#EE7548" },
  { x: -330, y: 3, r: 2.1, dur: 15, delay: 5.5, fill: "#A29C8C" },
  { x: 330, y: -4, r: 2.1, dur: 14.5, delay: 6.8, fill: "#A29C8C" },
];

function Scene() {
  return (
    <div className="relative hidden overflow-hidden lg:block" style={{ background: "radial-gradient(120% 90% at 50% 46%, #FCFAF5 0%, #F5F1E9 52%, #EDE7DB 100%)" }}>
      <svg viewBox="0 0 600 640" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <radialGradient id="lgCore" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFFFFF" /><stop offset="26%" stopColor="#FFEEDD" />
            <stop offset="62%" stopColor="#FFCFAE" stopOpacity=".45" /><stop offset="100%" stopColor="#EE7548" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="lgLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#C6BCA7" stopOpacity="0" /><stop offset="48%" stopColor="#F0A583" stopOpacity=".9" /><stop offset="100%" stopColor="#C6BCA7" stopOpacity="0" />
          </linearGradient>
          <filter id="soft2"><feGaussianBlur stdDeviation="3.6" /></filter>
        </defs>

        <g transform="translate(300,330)">
          {/* the plane, seen edge-on — ry far smaller than rx is what creates the eye-level view */}
          <ellipse rx="96" ry="10" fill="none" stroke="#B4A88F" strokeWidth="1" opacity=".55" style={{ animation: "arcbreathe 9s ease-in-out infinite" }} />
          <ellipse rx="160" ry="16" fill="none" stroke="#BFB49B" strokeWidth="1" opacity=".48" style={{ animation: "arcbreathe 11s ease-in-out .6s infinite" }} />
          <ellipse rx="236" ry="24" fill="none" stroke="#C9BEA6" strokeWidth="1" opacity=".4" />
          <ellipse rx="320" ry="34" fill="none" stroke="#D0C6B0" strokeWidth="3" opacity=".45" filter="url(#soft2)" />
          <ellipse rx="400" ry="46" fill="none" stroke="#D8CFBB" strokeWidth="4" opacity=".4" filter="url(#soft2)" />

          <line x1="-320" y1="0" x2="320" y2="0" stroke="url(#lgLine)" strokeWidth="2" />

          {DRIFT.map((d, i) => (
            <circle key={i} r={d.r} fill={d.fill}
              style={{ transform: `translate(${d.x}px, ${d.y}px)`, animation: `drift ${d.dur}s cubic-bezier(.45,0,.75,.4) ${d.delay}s infinite` }} />
          ))}

          <circle r="66" fill="url(#lgCore)" style={{ transformBox: "fill-box", transformOrigin: "center", animation: "corepulse 6s ease-in-out infinite" }} />
          <circle r="6" fill="#22243F" />
          <circle r="2.2" fill="#FFFFFF" />
        </g>
      </svg>

      <div className="absolute left-12 top-11 flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={brandLogo} alt={brandName} width={44} height={44} className="h-11 w-auto max-w-[150px] object-contain" />
        <span className="text-[16px] font-extrabold tracking-tight text-[var(--text)]">{brandName}</span>
      </div>

      <div className="absolute bottom-14 left-12 right-12 max-w-md" style={{ animation: "rise .7s ease both" }}>
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel)]/80 px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[var(--muted)] backdrop-blur">
          AI control, in your hands
        </div>
        <h2 className="text-[30px] font-bold leading-[1.12] tracking-tight text-[var(--text)]">Know what your AI can see, decide, and do.</h2>
        <p className="mt-3 text-[13.5px] leading-relaxed text-[var(--muted)]">
          Neo classifies and risk-tiers every AI use case, selects the controls that apply, and proves
          they are in place &mdash; your framework, your stack, your rules.
        </p>
      </div>
    </div>
  );
}
