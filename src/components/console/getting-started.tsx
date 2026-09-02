"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Rocket } from "lucide-react";
import { BRAND } from "@/lib/brand";

type Steps = { assessed: boolean; connected: boolean; invited: boolean; decided: boolean };

// Browser-level "don't show again" guard. This is the source of truth for a permanent
// dismiss, so the card stays gone even if the server write doesn't stick.
const DISMISS_KEY = "neo_getting_started_dismissed";

export default function GettingStarted({ steps }: { steps: Steps }) {
  const [hidden, setHidden] = useState(false);

  // If the user previously chose "Don't show again" on this browser, stay hidden.
  useEffect(() => {
    try { if (localStorage.getItem(DISMISS_KEY) === "1") setHidden(true); } catch { /* ignore */ }
  }, []);

  if (hidden) return null;

  const items = [
    { done: steps.assessed, label: "Assess your first AI use case", href: "/dashboard/use-cases", cta: "Open use cases" },
    { done: steps.connected, label: "Connect a system to verify a control", href: "/dashboard/integrations", cta: "Connect" },
    { done: steps.invited, label: "Invite a teammate", href: "/dashboard/settings", cta: "Invite" },
    { done: steps.decided, label: "Record a decision on a use case", href: "/dashboard/use-cases", cta: "Review" },
  ];
  const done = items.filter((i) => i.done).length;

  // permanent = "Don't show again" (persists on this browser + server);
  // otherwise just hide for this view.
  async function dismiss(permanent: boolean) {
    setHidden(true);
    if (permanent) { try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ } }
    try { await fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "dismiss" }) }); } catch { /* ignore */ }
  }

  return (
    <div className="rounded-[12px] border border-[#3b82f640] bg-[#3b82f60a] p-4">
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#3b82f6] text-white"><Rocket size={15} /></span>
        <div>
          <p className="text-[13px] font-bold text-[var(--text)]">Get started with {BRAND.name}</p>
          <p className="text-[11px] text-[var(--faint)]">{done} of {items.length} done</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <button onClick={() => dismiss(false)} className="text-[11px] text-[var(--faint)] hover:text-[var(--muted)]">Hide for now</button>
          <button onClick={() => dismiss(true)} className="text-[11px] font-semibold text-[var(--faint)] hover:text-[var(--muted)]">Don&apos;t show again</button>
        </div>
      </div>

      <div className="mt-3 flex flex-col divide-y divide-[var(--border)]">
        {items.map((it) => (
          <div key={it.label} className="flex items-center gap-3 py-2.5">
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${it.done ? "bg-[#22c55e] text-white" : "border border-[var(--border)] text-[var(--faint)]"}`}>
              {it.done ? "✓" : ""}
            </span>
            <span className={`text-[12.5px] ${it.done ? "text-[var(--faint)] line-through" : "text-[var(--text)]"}`}>{it.label}</span>
            {!it.done && (
              <Link href={it.href} className="ml-auto rounded-md border border-[var(--border)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)] hover:border-[#3b82f660] hover:text-[#3b82f6]">
                {it.cta} →
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
