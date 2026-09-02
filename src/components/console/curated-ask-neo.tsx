"use client";
import { BRAND } from "@/lib/brand";

/** The Ask Neo bar on the curated home — an unmistakable input, wired to the same
 *  portfolio Q&A endpoint. Adds your recent questions (don't re-ask), a clear for the
 *  answer and the history, and an anonymized "most asked in your org". */

import { useCallback, useEffect, useState } from "react";

const SUGGESTIONS = ["Board Briefing", "Model Risk Analysis", "Database Use Case Search"];
const PROMPTS: Record<string, string> = {
  "Board Briefing": "Brief me for the board — what's ready, what needs attention, what's awaiting a decision.",
  "Model Risk Analysis": "Which model providers do we depend on most, and where is the concentration risk?",
  "Database Use Case Search": "Which use cases reach the same data store, and what's the shared blast radius?",
};

export default function CuratedAskNeo() {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<string[]>([]);
  const [top, setTop] = useState<{ question: string; count: number }[]>([]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/ask-neo/history", { cache: "no-store" });
      const j = await res.json();
      setMine(Array.isArray(j.mine) ? j.mine : []);
      setTop(Array.isArray(j.top) ? j.top : []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  async function ask(question: string) {
    if (question.trim().length < 3 || busy) return;
    setBusy(true); setError(null); setAnswer(null);
    try {
      const res = await fetch("/api/report-query", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, mode: "portfolio" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Query failed");
      setAnswer(json.answer);
      loadHistory(); // the question we just asked now appears in recents/most-asked
    } catch (err) {
      setError(err instanceof Error ? err.message : "Query failed");
    } finally {
      setBusy(false);
    }
  }

  async function clearHistory() {
    setMine([]);
    try { await fetch("/api/ask-neo/history", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "clear" }) }); } catch { /* ignore */ }
    loadHistory();
  }

  const chip = "rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-left text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--faint)]";

  return (
    <div className="mt-5">
      <div className="mb-2 text-[12px] text-[var(--muted)]">Ask {BRAND.name}</div>
      <div className="flex items-center gap-2 rounded-[10px] border-2 border-[#06d6d6]/40 bg-[var(--surface)] p-2 pl-4 focus-within:border-[#06d6d6]">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask(q)}
          placeholder="Brief me for the board, or ask about any use case…"
          className="flex-1 bg-transparent text-[14px] text-[var(--text)] placeholder:text-[var(--faint)] outline-none"
        />
        <button onClick={() => ask(q)} disabled={busy || q.trim().length < 3}
          className="rounded-[8px] bg-[#06d6d6] px-4 py-1.5 text-[13px] font-semibold text-[#06212a] disabled:opacity-50">
          {busy ? "…" : "Ask"}
        </button>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11.5px]">
        <span className="text-[var(--faint)]">Suggestions:</span>
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => { setQ(PROMPTS[s]); ask(PROMPTS[s]); }} className={chip}>{s}</button>
        ))}
      </div>

      {busy && <p className="mt-3 text-[13px] text-[var(--muted)]">Thinking…</p>}
      {error && <p className="mt-3 text-[13px] text-red-500">{error}</p>}
      {answer && (
        <div className="mt-3 whitespace-pre-wrap rounded-md border border-[#06d6d630] bg-[#06d6d608] p-3 text-[13px] leading-relaxed text-[var(--text)]">
          {answer}
          <div className="mt-3 flex gap-4">
            <button onClick={() => { setAnswer(null); setQ(""); }} className="text-[12px] text-[#06d6d6] hover:underline">Ask another</button>
            <button onClick={() => setAnswer(null)} className="text-[12px] text-[var(--faint)] hover:text-[var(--text)]">Clear answer</button>
          </div>
        </div>
      )}

      {/* your recents */}
      {mine.length > 0 && (
        <div className="mt-3.5">
          <div className="mb-1.5 flex items-center gap-2 text-[11px] text-[var(--faint)]">
            <span className="uppercase tracking-[0.06em]">Your recent questions</span>
            <button onClick={clearHistory} className="text-[var(--faint)] hover:text-[var(--text)] underline">clear history</button>
          </div>
          <div className="flex flex-wrap gap-2 text-[11.5px]">
            {mine.map((qq, i) => (
              <button key={i} onClick={() => { setQ(qq); ask(qq); }} className={chip} title={qq}>
                {qq.length > 64 ? qq.slice(0, 64) + "…" : qq}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* anonymized org most-asked */}
      {top.length > 0 && (
        <div className="mt-3.5">
          <div className="mb-1.5 text-[11px] uppercase tracking-[0.06em] text-[var(--faint)]">Most asked in your org</div>
          <div className="flex flex-wrap gap-2 text-[11.5px]">
            {top.map((t, i) => (
              <button key={i} onClick={() => { setQ(t.question); ask(t.question); }} className={chip} title={t.question}>
                {t.question.length > 56 ? t.question.slice(0, 56) + "…" : t.question}
                {t.count > 1 && <span className="ml-1.5 text-[var(--faint)]">×{t.count}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
