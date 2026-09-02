"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface CtxQuestion { id: string; text: string; answer: string | null; status: string }
export interface CtxEntry { id: number; note: string; created_at: string }

function relTime(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export default function ContextPanel({
  useCaseId,
  questions,
  entries,
  canEdit,
}: {
  useCaseId: string;
  questions: CtxQuestion[];
  entries: CtxEntry[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function addContext() {
    if (note.trim().length < 2 || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/use-cases/${useCaseId}/context`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(typeof j.error === "string" ? j.error : "Could not add");
      }
      setNote("");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="text-sm font-bold text-[var(--text)]">Clarifying questions</h3>
        <p className="mb-3 mt-1 text-[13px] text-[var(--muted)]">
          Answers shape the risk tier and the controls. Edit any answer as the use case evolves, then
          regenerate the affected stages to re-assess.
        </p>
        <div className="flex flex-col gap-2.5">
          {questions.map((q) => (
            <QuestionRow key={q.id} q={q} canEdit={canEdit} />
          ))}
          {questions.length === 0 && (
            <p className="text-[13px] text-[var(--faint)]">No questions yet. They appear after the risk tier stage.</p>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-[var(--text)]">Add context</h3>
        <p className="mb-2 mt-1 text-[13px] text-[var(--muted)]">
          New detail, a change in scope, or a trigger that has fired. Adding context flags the assessment for
          re-assessment so the classification, tier, and controls can be refreshed.
        </p>
        {canEdit && (
          <div className="flex flex-col gap-2">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="e.g. The agent now also has write access to the CRM, and can issue refunds up to $1,000."
              className="w-full rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[#3b82f6]"
            />
            {err && <p className="text-[12px] text-red-500">{err}</p>}
            <button
              onClick={addContext}
              disabled={busy || note.trim().length < 2}
              className="self-start rounded-md bg-[#3b82f6] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Adding…" : "Add context"}
            </button>
          </div>
        )}

        {entries.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            {entries.map((e) => (
              <div key={e.id} className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--text)]">{e.note}</p>
                <p className="mt-1 text-[11px] text-[var(--faint)]">Added {relTime(e.created_at)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function QuestionRow({ q, canEdit }: { q: CtxQuestion; canEdit: boolean }) {
  const router = useRouter();
  const isOpen = q.status === "open";
  const [editing, setEditing] = useState(isOpen);
  const [answer, setAnswer] = useState(q.answer ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(notApplicable = false) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/questions/${q.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notApplicable ? { notApplicable: true } : { answer }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(typeof j.error === "string" ? j.error : "Failed to save");
      }
      setEditing(false);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-3.5">
      <p className="text-[13px] font-medium text-[var(--text)]">{q.text}</p>
      {editing ? (
        <div className="mt-2 flex gap-2">
          <input
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Answer…"
            className="flex-1 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-[13px] text-[var(--text)] outline-none focus:border-[#3b82f6]"
          />
          <button onClick={() => save(false)} disabled={busy || answer.trim().length === 0}
            className="rounded-md bg-[#3b82f6] px-4 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50">
            {busy ? "…" : "Save"}
          </button>
          <button onClick={() => save(true)} disabled={busy} title="Mark not applicable"
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[13px] font-semibold text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-50">
            N/A
          </button>
        </div>
      ) : (
        <div className="mt-1 flex items-start justify-between gap-3">
          <p className="text-[13px] text-[var(--muted)]">
            {q.status === "not_applicable" ? <span className="italic text-[var(--faint)]">Marked not applicable</span> : q.answer || <span className="italic text-[var(--faint)]">Unanswered</span>}
          </p>
          {canEdit && (
            <button onClick={() => setEditing(true)} className="shrink-0 text-[12px] font-semibold text-[#3b82f6] hover:underline">
              Edit
            </button>
          )}
        </div>
      )}
      {err && <p className="mt-1 text-[12px] text-red-500">{err}</p>}
    </div>
  );
}
