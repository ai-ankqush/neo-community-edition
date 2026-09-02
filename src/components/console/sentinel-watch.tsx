"use client";
import { BRAND } from "@/lib/brand";

/** The in-app face of Sentinel — polls for a live nudge and, when the actor's
 *  session is flagged hostile, surfaces the "Neo is watching" deterrent in real
 *  time. Demo-only. Shadow-first: it only ever appears when a finding has fired. */

import { useEffect, useRef, useState } from "react";
import { Eye, X } from "lucide-react";

type Nudge = { detail: string | null; reasons: string[] };
const sigOf = (n: Nudge) => `${n.detail ?? ""}|${(n.reasons ?? []).join("~")}`;

export default function SentinelWatch() {
  const [nudge, setNudge] = useState<Nudge | null>(null);
  // remember the SIGNATURE of the nudge the user dismissed, so the 3s poll can't
  // re-show the same one. It reappears only when the alert clears and a new one fires.
  const [dismissedSig, setDismissedSig] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const res = await fetch("/api/sentinel/status", { cache: "no-store" });
        const j = await res.json();
        if (!alive) return;
        if (j.active) {
          setNudge({ detail: j.detail ?? null, reasons: j.reasons ?? [] });
        } else {
          setNudge(null);
          setDismissedSig(null); // alert cleared — a future detection may surface again
        }
      } catch { /* ignore */ }
    }
    poll();
    timer.current = setInterval(poll, 3000);
    return () => { alive = false; if (timer.current) clearInterval(timer.current); };
  }, []);

  if (!nudge || sigOf(nudge) === dismissedSig) return null;

  return (
    <div className="fixed bottom-6 left-1/2 z-[60] w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 rounded-[14px] border border-[#e5484d66] bg-[#1a0e12] p-4 shadow-2xl">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e5484d22] text-[#e5484d]"><Eye size={17} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-bold text-[#ffd7d9]">{BRAND.name} is watching.</div>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-[#e8b9bd]">
            Unusual, consequential activity was detected on your account and <strong>logged</strong>. Your security team has been notified.
          </p>
          {nudge.reasons.length > 0 && (
            <p className="mt-1.5 text-[11.5px] text-[#c98e93]">{nudge.reasons[0]}</p>
          )}
        </div>
        <button onClick={() => setDismissedSig(sigOf(nudge))} className="text-[#c98e93] hover:text-[#ffd7d9]" aria-label="Dismiss"><X size={16} /></button>
      </div>
    </div>
  );
}
