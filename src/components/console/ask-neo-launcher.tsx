"use client";

import { useEffect, useState } from "react";
import { BRAND } from "@/lib/brand";
import { CLERK_ACTIVE } from "@/ce/auth-ui";

// Feedback routes to the operator console (Neo Control only) — hidden in Community Edition.
const HIDE_FEEDBACK = !CLERK_ACTIVE;

type Mode = "help" | "portfolio" | "feedback";

const SUGGESTIONS: Record<"help" | "portfolio", string[]> = {
  help: [
    "How do I run an assessment?",
    "What do the risk tiers mean?",
    "How do I verify a control?",
    "What's the difference between the plans?",
  ],
  portfolio: [
    "Which use cases have the most missing controls?",
    "Summarize our highest-risk use cases and what the board decided.",
    "What should we prioritize closing in the next 30 days?",
  ],
};

export default function AskNeoLauncher() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("help");
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // feedback tab
  const [fb, setFb] = useState("");
  const [fbBusy, setFbBusy] = useState(false);
  const [fbSent, setFbSent] = useState(false);
  const [fbErr, setFbErr] = useState<string | null>(null);

  // Deep link: /dashboard?ask=feedback opens the panel straight to the Feedback tab.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    if (!HIDE_FEEDBACK && p.get("ask") === "feedback") {
      setOpen(true);
      setMode("feedback");
    }
  }, []);

  async function sendFeedback() {
    if (fb.trim().length < 3 || fbBusy) return;
    setFbBusy(true);
    setFbErr(null);
    try {
      const page = typeof window !== "undefined" ? window.location.pathname : "";
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: fb, page }),
      });
      if (!res.ok) throw new Error("Could not send");
      setFbSent(true);
      setFb("");
    } catch {
      setFbErr("Could not send — please try again.");
    } finally {
      setFbBusy(false);
    }
  }

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setBusy(true);
    setError(null);
    setAnswer(null);
    try {
      const res = await fetch("/api/report-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, mode }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Query failed");
      setAnswer(json.answer);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Query failed");
    } finally {
      setBusy(false);
    }
  }

  function switchMode(m: Mode) {
    setMode(m);
    setAnswer(null);
    setError(null);
    setQ("");
    setFbSent(false);
    setFbErr(null);
  }

  return (
    <>
      {/* launcher button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-[#3b82f6] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-[#3b82f640] hover:bg-[#2f6fd6]"
          aria-label={`Ask ${BRAND.name}`}
        >
          <span className="text-[15px]">✦</span> Ask {BRAND.name}
        </button>
      )}

      {/* panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 flex max-h-[80vh] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-[14px] border border-[var(--border)] bg-[var(--panel)] shadow-2xl">
          {/* header */}
          <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-[15px]">✦</span>
              <span className="text-sm font-bold text-[var(--text)]">Ask {BRAND.name}</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-[var(--faint)] hover:text-[var(--text)]" aria-label="Close">✕</button>
          </div>

          {/* mode toggle */}
          <div className="flex gap-1 border-b border-[var(--border)] bg-[var(--panel)] px-3 py-2">
            <button
              onClick={() => switchMode("help")}
              className={`rounded-md px-3 py-1 text-[12.5px] font-medium ${mode === "help" ? "bg-[#3b82f6] text-white" : "text-[var(--muted)] hover:text-[var(--text)]"}`}
            >
              Product help
            </button>
            <button
              onClick={() => switchMode("portfolio")}
              className={`rounded-md px-3 py-1 text-[12.5px] font-medium ${mode === "portfolio" ? "bg-[#3b82f6] text-white" : "text-[var(--muted)] hover:text-[var(--text)]"}`}
            >
              My portfolio
            </button>
            {!HIDE_FEEDBACK && (
            <button
              onClick={() => switchMode("feedback")}
              className={`rounded-md px-3 py-1 text-[12.5px] font-medium ${mode === "feedback" ? "bg-[#3b82f6] text-white" : "text-[var(--muted)] hover:text-[var(--text)]"}`}
            >
              Feedback
            </button>
            )}
          </div>

          {/* body */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {mode === "feedback" ? (
              <div>
                <p className="mb-3 text-[12.5px] leading-relaxed text-[var(--faint)]">
                  Beta feedback goes straight to the {BRAND.name} team — bugs, confusing bits, missing features, anything. Thank you!
                </p>
                {fbSent ? (
                  <div className="rounded-md border border-[#22c55e40] bg-[#22c55e0f] p-3 text-[13px] text-[var(--text)]">
                    Got it — thank you. <button onClick={() => setFbSent(false)} className="text-[#3b82f6] hover:underline">Send more</button>
                  </div>
                ) : (
                  <>
                    <textarea
                      value={fb}
                      onChange={(e) => setFb(e.target.value)}
                      rows={6}
                      placeholder={`What's working, what's not, what would make ${BRAND.name} better…`}
                      className="w-full rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[#3b82f6]"
                    />
                    {fbErr && <p className="mt-2 text-[12px] text-red-500">{fbErr}</p>}
                    <button
                      onClick={sendFeedback}
                      disabled={fbBusy || fb.trim().length < 3}
                      className="mt-3 w-full rounded-md bg-[#3b82f6] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
                    >
                      {fbBusy ? "Sending…" : "Send feedback"}
                    </button>
                    <p className="mt-2 text-[11px] text-[var(--faint)]">We&apos;ll see the page you&apos;re on so we can find it faster.</p>
                  </>
                )}
              </div>
            ) : (
              <>
                <p className="mb-3 text-[12.5px] leading-relaxed text-[var(--faint)]">
                  {mode === "help"
                    ? "Ask how the platform and assessment process work."
                    : "Ask about your own portfolio — risk, controls implemented vs pending, decisions, readiness."}
                </p>

                {!answer && !busy && (
                  <div className="flex flex-col gap-1.5">
                    {SUGGESTIONS[mode].map((s) => (
                      <button
                        key={s}
                        onClick={() => { setQ(s); ask(s); }}
                        className="rounded-md border border-[var(--border)] px-3 py-2 text-left text-[12.5px] text-[var(--muted)] hover:border-[#3b82f660] hover:text-[var(--text)]"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}

                {busy && <p className="text-[13px] text-[var(--muted)]">Thinking…</p>}
                {error && <p className="text-[13px] text-red-500">{error}</p>}
                {answer && (
                  <div className="whitespace-pre-wrap rounded-md border border-[#3b82f630] bg-[#3b82f608] p-3 text-[13px] leading-relaxed text-[var(--text)]">
                    {answer}
                  </div>
                )}
                {answer && !busy && (
                  <button onClick={() => { setAnswer(null); setQ(""); }} className="mt-3 text-[12px] text-[#3b82f6] hover:underline">
                    Ask another question
                  </button>
                )}
              </>
            )}
          </div>

          {/* input */}
          {mode !== "feedback" && (
          <div className="border-t border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="flex gap-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && ask(q)}
                placeholder={mode === "help" ? `Ask ${BRAND.name} about the product…` : `Ask ${BRAND.name} about your portfolio…`}
                className="flex-1 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[#3b82f6]"
              />
              <button
                onClick={() => ask(q)}
                disabled={busy || q.trim().length < 3}
                className="rounded-md bg-[#3b82f6] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {busy ? "…" : "Ask"}
              </button>
            </div>
            <p className="mt-2 text-[11px] text-[#4b5563]">
              Need a person? <a href="/dashboard/help" className="text-[var(--faint)] underline hover:text-[var(--text)]">Open Help &amp; support</a>
            </p>
          </div>
          )}
        </div>
      )}
    </>
  );
}
