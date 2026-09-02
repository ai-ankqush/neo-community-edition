"use client";

import { useEffect, useRef, useState } from "react";

interface Org {
  orgId: string;
  name: string;
  role: string;
}

/**
 * Built-in (Sky) organization switcher — the Community Edition equivalent of
 * Clerk's <OrganizationSwitcher>. Lists the orgs the signed-in user belongs to,
 * switches the active org (re-issues the session), and creates new orgs.
 */
export default function BuiltinOrgSwitcher() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const r = await fetch("/api/sky/orgs", { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      setOrgs(j.orgs ?? []);
      setActiveId(j.activeOrgId ?? null);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
        setErr(null);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function switchTo(orgId: string) {
    if (orgId === activeId || busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/sky/orgs/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId }),
      });
      if (r.ok) {
        window.location.href = "/dashboard";
        return;
      }
      const j = await r.json().catch(() => ({}));
      setErr(j.error || "Could not switch organization.");
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/sky/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (r.ok) {
        window.location.href = "/dashboard";
        return;
      }
      const j = await r.json().catch(() => ({}));
      setErr(j.error || "Could not create organization.");
    } finally {
      setBusy(false);
    }
  }

  const active = orgs.find((o) => o.orgId === activeId);
  const activeName = active?.name ?? "Organization";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex max-w-[220px] items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[13px] text-[var(--text)] hover:bg-[var(--panel-hover)]"
        title="Switch organization"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[var(--border)] text-[11px] font-bold uppercase">
          {activeName.slice(0, 1)}
        </span>
        <span className="truncate">{activeName}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-[var(--muted)]">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-10 z-50 w-72 rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-xl">
          <div className="border-b border-[var(--border)] px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">
            Organizations
          </div>
          <div className="max-h-72 overflow-auto py-1">
            {orgs.map((o) => (
              <button
                key={o.orgId}
                onClick={() => switchTo(o.orgId)}
                disabled={busy}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-[var(--panel-hover)] disabled:opacity-50"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[var(--border)] text-[11px] font-bold uppercase">
                  {o.name.slice(0, 1)}
                </span>
                <span className="flex-1 truncate text-[var(--text)]">{o.name}</span>
                {o.orgId === activeId && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </button>
            ))}
          </div>

          <div className="border-t border-[var(--border)] p-2">
            {creating ? (
              <div className="flex flex-col gap-2">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && create()}
                  placeholder="New organization name"
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1.5 text-[13px] text-[var(--text)] outline-none focus:border-[#3b82f6]"
                />
                <div className="flex gap-2">
                  <button
                    onClick={create}
                    disabled={busy || !name.trim()}
                    className="flex-1 rounded-md bg-[#3b82f6] px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"
                  >
                    Create &amp; switch
                  </button>
                  <button
                    onClick={() => { setCreating(false); setName(""); setErr(null); }}
                    className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[13px] text-[var(--muted)]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-[var(--muted)] hover:bg-[var(--panel-hover)] hover:text-[var(--text)]"
              >
                <span className="text-[15px] leading-none">+</span> Create organization
              </button>
            )}
            {err && <p className="mt-2 px-1 text-[12px] text-[#ef4444]">{err}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
