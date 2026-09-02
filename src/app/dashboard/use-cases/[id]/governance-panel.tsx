"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Exc { id: string; title: string; detail: string | null; risk_owner: string | null; status: string; expires_on: string | null }
interface Inc { id: string; title: string; severity: string; status: string; note: string | null; occurred_at: string | null }

const LIFECYCLE = ["proposed", "pilot", "production", "retired"] as const;
const SEV_COLOR: Record<string, string> = { low: "#64748b", medium: "#f59e0b", high: "#f97316", critical: "#ef4444" };

export default function GovernancePanel({
  useCaseId, technicalOwner, sponsor, lifecycle, exceptions, incidents, canEdit,
}: {
  useCaseId: string; technicalOwner: string | null; sponsor: string | null; lifecycle: string | null;
  exceptions: Exc[]; incidents: Inc[]; canEdit: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [tech, setTech] = useState(technicalOwner ?? "");
  const [spon, setSpon] = useState(sponsor ?? "");
  const [life, setLife] = useState(lifecycle ?? "");
  const [showExc, setShowExc] = useState(false);
  const [showInc, setShowInc] = useState(false);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const r = await fetch(`/api/use-cases/${useCaseId}/governance`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (r.ok) router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <div className="mt-4 rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Governance</div>

      {/* ownership + lifecycle */}
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--muted)]">Technical owner
          <input value={tech} onChange={(e) => setTech(e.target.value)} disabled={!canEdit} placeholder="—" className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1.5 text-[12.5px] text-[var(--text)]" />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--muted)]">Sponsor
          <input value={spon} onChange={(e) => setSpon(e.target.value)} disabled={!canEdit} placeholder="—" className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1.5 text-[12.5px] text-[var(--text)]" />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--muted)]">Lifecycle
          <select value={life} onChange={(e) => setLife(e.target.value)} disabled={!canEdit} className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1.5 text-[12.5px] text-[var(--text)]">
            <option value="">Not set</option>
            {LIFECYCLE.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
      </div>
      {canEdit && (
        <button onClick={() => post({ action: "fields", technicalOwner: tech, sponsor: spon, lifecycle: life || null })} disabled={busy}
          className="mt-2 rounded-md bg-[#0d9488] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-60">Save</button>
      )}

      {/* exceptions */}
      <div className="mt-4 border-t border-[var(--surface-2)] pt-3">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold text-[var(--text)]">Exceptions (accepted risk)</span>
          <span className="text-[11px] text-[var(--muted)]">{exceptions.filter((e) => e.status === "open").length} open</span>
          {canEdit && <button onClick={() => setShowExc((v) => !v)} className="ml-auto text-[12px] font-semibold text-[#0d9488]">{showExc ? "Cancel" : "+ Add"}</button>}
        </div>
        {showExc && <AddException onAdd={(b) => { post({ action: "add_exception", ...b }); setShowExc(false); }} />}
        <div className="mt-2 flex flex-col gap-1">
          {exceptions.length === 0 && <p className="text-[12px] text-[var(--muted)]">No exceptions recorded.</p>}
          {exceptions.map((e) => (
            <div key={e.id} className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5">
              <span className="text-[12.5px] text-[var(--text)]">{e.title}</span>
              {e.risk_owner && <span className="text-[11px] text-[var(--muted)]">· {e.risk_owner}</span>}
              {e.expires_on && <span className="text-[11px] text-[var(--muted)]">· expires {e.expires_on}</span>}
              <span className="ml-auto text-[11px] font-semibold" style={{ color: e.status === "open" ? "#f59e0b" : "#16a34a" }}>{e.status}</span>
              {canEdit && e.status === "open" && <button onClick={() => post({ action: "close_exception", id: e.id })} disabled={busy} className="text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--text)]">Close</button>}
            </div>
          ))}
        </div>
      </div>

      {/* incidents */}
      <div className="mt-4 border-t border-[var(--surface-2)] pt-3">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold text-[var(--text)]">Incidents</span>
          <span className="text-[11px] text-[var(--muted)]">{incidents.filter((i) => i.status !== "resolved").length} open</span>
          {canEdit && <button onClick={() => setShowInc((v) => !v)} className="ml-auto text-[12px] font-semibold text-[#0d9488]">{showInc ? "Cancel" : "+ Add"}</button>}
        </div>
        {showInc && <AddIncident onAdd={(b) => { post({ action: "add_incident", ...b }); setShowInc(false); }} />}
        <div className="mt-2 flex flex-col gap-1">
          {incidents.length === 0 && <p className="text-[12px] text-[var(--muted)]">No incidents recorded.</p>}
          {incidents.map((i) => (
            <div key={i.id} className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5">
              <span className="rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ color: SEV_COLOR[i.severity], background: `${SEV_COLOR[i.severity]}1f` }}>{i.severity}</span>
              <span className="text-[12.5px] text-[var(--text)]">{i.title}</span>
              <span className="ml-auto text-[11px] font-semibold" style={{ color: i.status === "resolved" ? "#16a34a" : "#f59e0b" }}>{i.status}</span>
              {canEdit && i.status !== "resolved" && <button onClick={() => post({ action: "resolve_incident", id: i.id })} disabled={busy} className="text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--text)]">Resolve</button>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AddException({ onAdd }: { onAdd: (b: { title: string; detail?: string; riskOwner?: string; expiresOn?: string }) => void }) {
  const [title, setTitle] = useState(""); const [owner, setOwner] = useState(""); const [exp, setExp] = useState("");
  return (
    <div className="mt-2 grid gap-2 rounded-md border border-[var(--border)] bg-[var(--panel)] p-2.5 sm:grid-cols-3">
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Accepted risk" className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-[12px] sm:col-span-3" />
      <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Risk owner" className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-[12px]" />
      <input value={exp} onChange={(e) => setExp(e.target.value)} type="date" className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-[12px]" />
      <button onClick={() => title.trim() && onAdd({ title, riskOwner: owner || undefined, expiresOn: exp || undefined })} className="rounded-md bg-[#0d9488] px-3 py-1.5 text-[12px] font-semibold text-white">Add exception</button>
    </div>
  );
}

function AddIncident({ onAdd }: { onAdd: (b: { title: string; severity: "low" | "medium" | "high" | "critical"; occurredAt?: string }) => void }) {
  const [title, setTitle] = useState(""); const [sev, setSev] = useState<"low" | "medium" | "high" | "critical">("medium"); const [when, setWhen] = useState("");
  return (
    <div className="mt-2 grid gap-2 rounded-md border border-[var(--border)] bg-[var(--panel)] p-2.5 sm:grid-cols-3">
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What happened" className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-[12px] sm:col-span-3" />
      <select value={sev} onChange={(e) => setSev(e.target.value as typeof sev)} className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-[12px]">
        {["low", "medium", "high", "critical"].map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <input value={when} onChange={(e) => setWhen(e.target.value)} type="date" className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-[12px]" />
      <button onClick={() => title.trim() && onAdd({ title, severity: sev, occurredAt: when || undefined })} className="rounded-md bg-[#0d9488] px-3 py-1.5 text-[12px] font-semibold text-white">Add incident</button>
    </div>
  );
}
