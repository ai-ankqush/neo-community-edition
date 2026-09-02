"use client";
import { BRAND } from "@/lib/brand";

/** Executive Reports — generate a risk report by scope, on demand. Each "Generate"
 *  opens the existing printable report view in a new tab → save to PDF. Nothing is
 *  stored: no library, no retained report data. */

import { useState } from "react";
import { Bot, Building2, Network, BarChart3 } from "lucide-react";
import { CLERK_ACTIVE } from "@/ce/auth-ui";

// AI Vendor Risk + AI Supply Chain are Neo Control (paid) modules — hidden in Community Edition.
const community = !CLERK_ACTIVE;

type Item = { id: string; name: string };

function openReport(href: string) {
  if (typeof window !== "undefined") window.open(href, "_blank", "noopener,noreferrer");
}

export default function ExecutiveReports({ useCases, vendors }: { useCases: Item[]; vendors: Item[] }) {
  const [uc, setUc] = useState(useCases[0]?.id ?? "");
  const [vendor, setVendor] = useState(vendors[0]?.id ?? "");
  const [scUc, setScUc] = useState(""); // "" = whole estate

  const sel = "min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1.5 text-[12px] text-[var(--text)] outline-none focus:border-[#3b82f6]";
  const gen = "shrink-0 rounded-md border border-[#3b82f6] bg-[#3b82f6]/10 px-3.5 py-1.5 text-[12px] font-semibold text-[#3b82f6] transition-colors hover:bg-[#3b82f6]/20 disabled:opacity-40";

  return (
    <div className="w-full">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#5f7186]">Executive Reports</div>
      <h1 className="mt-1 text-[20px] font-medium tracking-[-0.01em] text-[var(--text)]">Generate a risk report</h1>
      <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-[var(--muted)]">
        Board-ready and verdict-first. Pick a scope and {BRAND.name} opens a printable report — save it to PDF from your browser.
        <span className="text-[var(--faint)]"> Reports are generated on demand and not stored.</span>
      </p>

      <div className="mt-6 grid gap-3.5 md:grid-cols-2">
        {/* AI Use Case Risk */}
        <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex items-center gap-2.5 text-[14px] font-medium text-[var(--text)]"><Bot size={18} className="text-[#3b82f6]" /> AI Use Case Risk</div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--muted)]">One AI system: verdict, authority, residual risk, controls and proof.</p>
          <div className="mt-3.5 flex items-center gap-2">
            <select className={sel} value={uc} onChange={(e) => setUc(e.target.value)} disabled={!useCases.length}>
              {useCases.length ? useCases.map((u) => <option key={u.id} value={u.id}>{u.name}</option>) : <option value="">No use cases yet</option>}
            </select>
            <button className={gen} disabled={!uc} onClick={() => openReport(`/dashboard/use-cases/${uc}/report`)}>Generate</button>
          </div>
        </div>

        {/* AI Vendor Risk — Neo Control only */}
        {!community && (
        <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex items-center gap-2.5 text-[14px] font-medium text-[var(--text)]"><Building2 size={18} className="text-[#8b5cf6]" /> AI Vendor Risk</div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--muted)]">One third-party AI: what it can touch, the evidence, and the decision.</p>
          <div className="mt-3.5 flex items-center gap-2">
            <select className={sel} value={vendor} onChange={(e) => setVendor(e.target.value)} disabled={!vendors.length}>
              {vendors.length ? vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>) : <option value="">No vendor reviews yet</option>}
            </select>
            <button className={gen} disabled={!vendor} onClick={() => openReport(`/dashboard/vendor-reviews/${vendor}/report`)}>Generate</button>
          </div>
        </div>
        )}

        {/* AI Supply Chain Risk — Neo Control only */}
        {!community && (
        <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex items-center gap-2.5 text-[14px] font-medium text-[var(--text)]"><Network size={18} className="text-[#14b8a6]" /> AI Supply Chain Risk</div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--muted)]">The AI behind your AI: dependencies, concentration, blast radius, AI-BOM.</p>
          <div className="mt-3.5 flex items-center gap-2">
            <select className={sel} value={scUc} onChange={(e) => setScUc(e.target.value)}>
              <option value="">Whole estate</option>
              {useCases.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <button className={gen} onClick={() => openReport(`/dashboard/supply-chain/report${scUc ? `?uc=${scUc}` : ""}`)}>Generate</button>
          </div>
        </div>
        )}

        {/* Executive Summary */}
        <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex items-center gap-2.5 text-[14px] font-medium text-[var(--text)]"><BarChart3 size={18} className="text-[#d97706]" /> Executive Summary</div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--muted)]">The whole estate for the board: posture, top risks, and what to fix first.</p>
          <div className="mt-3.5 flex items-center gap-2">
            <span className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1.5 text-[12px] text-[var(--muted)]">Whole estate</span>
            <button className={gen} onClick={() => openReport(`/dashboard/executive`)}>Generate</button>
          </div>
        </div>
      </div>
    </div>
  );
}
