"use client";

import { useState } from "react";
import { BRAND } from "@/lib/brand";

const SUGGESTIONS = [
  "Which use cases have the most missing controls?",
  "Summarize our highest-risk AI use cases and what the board decided.",
  "Where are we exposed on EU AI Act readiness?",
  "What should we prioritize closing in the next 30 days?",
];

export default function ReportQuery() {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(question: string) {
    if (!question.trim()) return;
    setBusy(true);
    setError(null);
    setAnswer(null);
    try {
      const res = await fetch("/api/report-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
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

  return (
    <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[15px]">✦</span>
        <h3 className="text-sm font-bold text-[var(--text)]">Ask {BRAND.name}</h3>
        <span className="rounded-full border border-[#3b82f640] bg-[#3b82f61a] px-2 py-0.5 text-[10px] font-bold text-[#3b82f6]">ASSISTANT</span>
      </div>
      <p className="mb-3 text-[13px] text-[var(--faint)]">
        Your AI control analyst. Ask about risk, controls implemented vs pending, decisions, and
        readiness across the portfolio. (Integration walkthroughs — e.g. Jira, ServiceNow — coming soon.)
      </p>
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask(q)}
          placeholder={`Ask ${BRAND.name}... e.g. how many controls are implemented vs pending, and what did we decide on the HR assistant?`}
          className="flex-1 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[#3b82f6]"
        />
        <button
          onClick={() => ask(q)}
          disabled={busy || q.trim().length < 3}
          className="rounded-md bg-[#3b82f6] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Analyzing..." : "Ask"}
        </button>
      </div>

      {!answer && !busy && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => { setQ(s); ask(s); }}
              className="rounded-full border border-[var(--border)] px-2.5 py-1 text-[11.5px] text-[var(--muted)] hover:border-[#3b82f660] hover:text-[var(--text)]">
              {s}
            </button>
          ))}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
      {answer && (
        <div className="mt-4 whitespace-pre-wrap rounded-md border border-[#3b82f630] bg-[#3b82f608] p-4 text-[13px] leading-relaxed text-[var(--text)]">
          {answer}
        </div>
      )}
    </div>
  );
}
