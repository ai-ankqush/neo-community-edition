"use client";

import { useState } from "react";

type Row = { id: number; at: string; who: string; action: string; stage: string | null; item: string };

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export default function AuditLog() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && rows === null && !loading) {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch("/api/audit", { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Could not load");
        setRows(json.rows as Row[]);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not load");
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div>
      <button
        onClick={toggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-[13px] font-medium text-[var(--text)] hover:bg-[var(--row)]"
      >
        <span>{open ? "Hide activity" : "Show activity (last 30 days)"}</span>
        <span className="text-[var(--faint)]">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className="border-t border-[var(--border)]">
          {loading && <p className="px-4 py-6 text-[13px] text-[var(--faint)]">Loading…</p>}
          {err && <p className="px-4 py-6 text-[13px] text-red-500">{err}</p>}
          {rows && rows.length === 0 && (
            <p className="px-4 py-6 text-[13px] text-[var(--faint)]">No activity in the last 30 days.</p>
          )}
          {rows && rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12.5px]">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[11px] uppercase tracking-wide text-[var(--faint)]">
                    <th className="px-4 py-2 font-semibold">When</th>
                    <th className="px-4 py-2 font-semibold">Who</th>
                    <th className="px-4 py-2 font-semibold">Action</th>
                    <th className="px-4 py-2 font-semibold">Item</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.id} className="border-b border-[var(--row)] last:border-0">
                      <td className="whitespace-nowrap px-4 py-2 text-[var(--muted)]" title={new Date(e.at).toLocaleString()}>
                        {relTime(e.at)}
                      </td>
                      <td className="px-4 py-2 text-[var(--text)]">{e.who}</td>
                      <td className="px-4 py-2 text-[var(--text)]">
                        {e.action}
                        {e.stage && <span className="text-[var(--faint)]"> · {e.stage}</span>}
                      </td>
                      <td className="px-4 py-2 text-[var(--muted)]">{e.item}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
