"use client";

import { useState } from "react";

/** Attach manual evidence — a link to the artifact (policy, ticket, screenshot)
 *  plus an optional note. Used for controls no integration can verify, and for
 *  assurance tests. (File upload is a planned fast-follow.) */
export default function EvidenceAttach({
  endpoint, initialUrl, initialNote, withNote = false, canEdit, manual = false,
}: {
  endpoint: string;
  initialUrl: string | null;
  initialNote?: string | null;
  withNote?: boolean;
  canEdit: boolean;
  manual?: boolean;
}) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [note, setNote] = useState(initialNote ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (busy) return;
    setBusy(true); setErr(null); setSaved(false);
    try {
      const body: Record<string, string> = { evidenceUrl: url };
      if (withNote) body.note = note;
      const r = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(typeof j.error === "string" ? j.error : "Save failed"); }
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally { setBusy(false); }
  }

  const field = "rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[12.5px] text-[var(--text)] outline-none focus:border-[#3b82f6]";

  return (
    <div className="mt-2 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--faint)]">{manual ? "Manual evidence" : "Evidence link"}</span>
        {manual && <span className="rounded bg-[#8892a41a] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--muted)]">No integration can verify this — attach it</span>}
      </div>
      {canEdit ? (
        <div className="mt-1.5 flex flex-col gap-1.5">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://link to the artifact (policy doc, ticket, screenshot)" className={`${field} w-full`} />
          {withNote && <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note — what this proves" className={`${field} w-full`} />}
          <div className="flex items-center gap-2">
            <button onClick={save} disabled={busy} className="rounded-md bg-[#3b82f6] px-3 py-1 text-[11.5px] font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
            {saved && <span className="text-[11px] text-[var(--good)]">Saved ✓</span>}
            {url && <a href={url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[#3b82f6] underline">open ↗</a>}
          </div>
          {err && <p className="text-[11px] text-red-500">{err}</p>}
        </div>
      ) : (
        <div className="mt-1 text-[12px] text-[var(--muted)]">
          {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="text-[#3b82f6] underline">view evidence ↗</a> : <span className="text-[var(--faint)]">none attached</span>}
        </div>
      )}
    </div>
  );
}
