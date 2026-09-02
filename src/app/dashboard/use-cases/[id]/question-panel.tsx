"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Q {
  id: string;
  text: string;
  answer: string | null;
  status: string;
}

export default function QuestionPanel({ questions }: { questions: Q[] }) {
  const open = questions.filter((q) => q.status === "open");
  const answered = questions.filter((q) => q.status === "answered");

  if (questions.length === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="mb-1 font-semibold text-[var(--text)]">
        Context{" "}
        <span className="text-sm font-normal text-[var(--faint)]">
          {answered.length}/{questions.length} answered
        </span>
      </h2>
      <p className="mb-3 text-sm text-[var(--muted)]">
        Answer these to shape the risk tier and controls. You can edit answers and add more context any time from the Context tab.
      </p>
      <div className="space-y-3">
        {open.map((q) => (
          <QuestionRow key={q.id} q={q} />
        ))}
        {answered.map((q) => (
          <div key={q.id} className="rounded-lg border border-[#22c55e40] bg-[#22c55e14] p-4">
            <p className="text-sm font-medium text-[var(--text)]">{q.text}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">{q.answer}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuestionRow({ q }: { q: Q }) {
  const router = useRouter();
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(notApplicable = false) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/questions/${q.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notApplicable ? { notApplicable: true } : { answer }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(typeof json.error === "string" ? json.error : "Failed to save");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="mb-2 text-sm font-medium text-[var(--text)]">{q.text}</p>
      <div className="flex gap-2">
        <input
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Answer..."
          className="flex-1 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm text-[var(--text)] outline-none focus:border-cyan-brand"
        />
        <button
          onClick={() => submit(false)}
          disabled={busy || answer.trim().length === 0}
          className="rounded-md bg-[#3b82f6] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "..." : "Save"}
        </button>
        <button
          onClick={() => submit(true)}
          disabled={busy}
          title="Mark this question not applicable to this use case"
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm font-semibold text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-50"
        >
          N/A
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
