"use client";
import { BRAND } from "@/lib/brand";

/** App-style left rail for the public demo. Items smooth-scroll to the on-page sections
 *  (the demo is one page), so it reads like the real console without multi-page navigation. */
const ITEMS: [string, string][] = [
  ["dashboard", "Dashboard"],
  ["assess", "AI Assessments"],
  ["control-graph", "AI Control Graph"],
  ["supply-chain", "AI Supply Chain"],
  ["vendor", "AI Vendor Review"],
  ["action-fabric", "AI Action Fabric"],
  ["integrations", "Integrations"],
  ["settings", "Settings"],
];

export default function DemoSidebar() {
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-elevated)] py-4 md:flex">
      <div className="flex items-center gap-2.5 px-5 pb-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/neo-logo.png" alt={`${BRAND.name}`} className="h-8 w-8" />
        <span className="text-sm font-bold leading-tight">
          {BRAND.name}<br /><span className="text-[10px] font-medium text-[var(--muted)]">AI Control Architecture</span>
        </span>
      </div>
      <nav className="flex flex-col">
        {ITEMS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => go(id)}
            className="flex items-center gap-3 border-l-2 border-transparent px-4 py-2.5 text-left text-[13px] font-semibold text-[var(--muted)] transition hover:bg-[var(--border)] hover:text-[var(--text)]"
          >
            {label}
          </button>
        ))}
      </nav>
    </aside>
  );
}
