"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";

type TourScreen = {
  eyebrow: string;
  title: string;
  items: { icon: string; label: string; desc: string }[];
};

const TOUR: TourScreen[] = [
  {
    eyebrow: "Assess",
    title: "Understand the AI and its risk",
    items: [
      { icon: "🔍", label: "Classify", desc: "what your AI can see, decide, and do — and how autonomously." },
      { icon: "🎚️", label: "Risk tier", desc: "an objective tier with the triggers that would escalate it." },
      { icon: "🛡️", label: "Controls", desc: "the right controls across 10 pillars, mapped to your tech stack." },
    ],
  },
  {
    eyebrow: "Test · Engineer · Verify",
    title: "Prove the controls are real",
    items: [
      { icon: "🎯", label: "Red Team", desc: "adversarial tests that try to make your AI misbehave." },
      { icon: "🏗️", label: "Build & Deploy", desc: "generate prevention code and detection rules for your stack." },
      { icon: "🔌", label: "Integrations", desc: "read your cloud, identity and repos to verify controls live." },
    ],
  },
  {
    eyebrow: "Govern",
    title: "Govern it end to end",
    items: [
      { icon: "🧾", label: "Vendor AI Review", desc: "vet third-party AI products before you buy them." },
      { icon: "🔐", label: "Enterprise", desc: "SSO, granular RBAC, and an append-only audit trail." },
      { icon: "📋", label: "Decisions", desc: "record approvals with conditions and sign-off." },
    ],
  },
];

export default function Concierge({ firstName }: { firstName?: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [step, setStep] = useState<"welcome" | "tour">("welcome");
  const [tourIdx, setTourIdx] = useState(0);

  if (!open) return null;
  const hello = firstName ? `Welcome, ${firstName}.` : `Welcome to ${BRAND.name}.`;
  const lastTour = tourIdx === TOUR.length - 1;

  async function markWelcomed() {
    try { await fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "welcome" }) }); } catch { /* ignore */ }
  }
  async function skip() { await markWelcomed(); setOpen(false); }
  async function start() { await markWelcomed(); setOpen(false); router.push("/dashboard/use-cases/new"); }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-7 shadow-2xl">
        <div className="mb-4 flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={BRAND.logoUrl} alt={BRAND.name} className="h-9 w-9 rounded-xl object-contain" />
          <span className="text-[13px] font-semibold text-[var(--muted)]">{BRAND.name}</span>
          <button onClick={skip} className="ml-auto text-[12px] text-[var(--faint)] hover:text-[var(--muted)]">Skip</button>
        </div>

        {step === "welcome" && (
          <>
            <h2 className="text-xl font-bold text-[var(--text)]">{hello} I&apos;m {BRAND.name}.</h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--muted)]">
              I put your enterprise AI under control — from understanding what it can do, to proving the controls are real and governing it end to end.
              Here&apos;s what I do, in 30 seconds.
            </p>
            <div className="mt-6 flex items-center justify-between">
              <button onClick={skip} className="text-[12.5px] text-[var(--faint)] hover:text-[var(--muted)]">Skip the tour</button>
              <button onClick={() => { setStep("tour"); setTourIdx(0); }}
                className="rounded-lg bg-[#3b82f6] px-5 py-2.5 text-sm font-semibold text-white">Show me →</button>
            </div>
          </>
        )}

        {step === "tour" && (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#3b82f6]">{TOUR[tourIdx].eyebrow}</p>
            <h2 className="mt-1 text-lg font-bold text-[var(--text)]">{TOUR[tourIdx].title}</h2>
            <div className="mt-4 flex flex-col gap-3">
              {TOUR[tourIdx].items.map((it) => (
                <div key={it.label} className="flex gap-3">
                  <span className="text-[18px] leading-none">{it.icon}</span>
                  <p className="text-[13px] leading-relaxed text-[var(--muted)]">
                    <span className="font-semibold text-[var(--text)]">{it.label}</span> — {it.desc}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-6 flex items-center gap-2">
              {TOUR.map((_, i) => (
                <span key={i} className={`h-1.5 rounded-full transition-all ${i === tourIdx ? "w-5 bg-[#3b82f6]" : "w-1.5 bg-[var(--border)]"}`} />
              ))}
              <div className="ml-auto flex items-center gap-2">
                <button onClick={() => (tourIdx === 0 ? setStep("welcome") : setTourIdx(tourIdx - 1))}
                  className="rounded-md px-3 py-1.5 text-[12.5px] text-[var(--faint)] hover:text-[var(--muted)]">Back</button>
                {lastTour ? (
                  <button onClick={start}
                    className="rounded-lg bg-[#3b82f6] px-4 py-2 text-[13px] font-semibold text-white">Assess my first use case →</button>
                ) : (
                  <button onClick={() => setTourIdx(tourIdx + 1)}
                    className="rounded-lg bg-[#3b82f6] px-4 py-2 text-[13px] font-semibold text-white">Next →</button>
                )}
              </div>
            </div>
            {lastTour && (
              <div className="mt-3 text-center">
                <button onClick={skip} className="text-[12px] text-[var(--faint)] hover:text-[var(--muted)]">I&apos;ll explore on my own</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
