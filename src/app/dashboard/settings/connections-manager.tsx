"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";

type Conn = { id: string; provider: string; label: string | null; status: string };

export default function ConnectionsManager({ connections }: { connections: Conn[] }) {
  const router = useRouter();
  const [repo, setRepo] = useState("");
  const [installationId, setInstallationId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const field =
    "rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[#3b82f6]";

  async function connect() {
    if (!repo || !installationId || busy) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "github", repo, installationId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Could not connect");
      setRepo(""); setInstallationId("");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not connect");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/connections/${id}`, { method: "DELETE" });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error ?? "Could not remove"); }
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not remove");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-4">
      {connections.length > 0 ? (
        <div className="mb-4 flex flex-col divide-y divide-[var(--border)]">
          {connections.map((c) => (
            <div key={c.id} className="flex items-center gap-3 py-2.5">
              <span className="rounded bg-[#3b82f614] px-2 py-0.5 text-[11px] font-semibold uppercase text-[#3b82f6]">
                {c.provider}
              </span>
              <span className="text-[13px] text-[var(--text)]">{c.label}</span>
              <span className="text-[11px] text-[var(--good)]">● {c.status}</span>
              <button
                onClick={() => revoke(c.id)}
                disabled={busy}
                className="ml-auto rounded-md border border-[var(--border)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)] hover:border-red-500/50 hover:text-red-500 disabled:opacity-50"
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mb-4 text-[12.5px] text-[var(--faint)]">No connections yet. Connect a GitHub repo to verify AI-BOM evidence.</p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-[11px] uppercase text-[var(--faint)]">GitHub repo (owner/name)</label>
          <input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="acme/ml-platform" className={`${field} w-full`} />
        </div>
        <div className="min-w-[160px]">
          <label className="mb-1 block text-[11px] uppercase text-[var(--faint)]">Installation id</label>
          <input value={installationId} onChange={(e) => setInstallationId(e.target.value)} placeholder="12345678" className={`${field} w-full`} />
        </div>
        <button
          onClick={connect}
          disabled={!repo || !installationId || busy}
          className="rounded-md bg-[#3b82f6] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Connecting…" : "Connect"}
        </button>
      </div>
      {err && <p className="mt-2 text-[12.5px] text-red-500">{err}</p>}
      <p className="mt-3 text-[11px] leading-relaxed text-[var(--faint)]">
        Install the {BRAND.name} GitHub App on the repo (read-only Contents), then paste the repo and the
        installation id from the install URL. {BRAND.name} stores only the non-secret installation id — never a token.
      </p>
    </div>
  );
}
