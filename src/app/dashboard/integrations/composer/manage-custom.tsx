"use client";

import { useState } from "react";
import { Card } from "@/components/console/ui";
import { BrandMark } from "@/components/console/brand-mark";

type Finding = { label: string; pass: boolean; proves: string };

export type CustomCheck = {
  checkId: string;
  connectorId?: string;
  name: string;
  systemName: string;
  controlText: string | null;
  plainSummary: string | null;
  lastRollup: string | null;
  lastState: string | null;
  lastRunAt: string | null;
  expiresAt: string | null;
  findings: Finding[] | null;
  connectorOnly?: boolean;
};

const ROLLUP_C: Record<string, string> = { verified: "#22c55e", partial: "#f59e0b", missing: "#ef4444", na: "#64748b" };
const ROLLUP_LABEL: Record<string, string> = { verified: "Verified", partial: "Partial", missing: "Missing", na: "Not verified yet" };
const STATE_LABEL: Record<string, string> = {
  verified: "Verified", exists_not_verified: "Exists but not verified", exists_misconfigured: "Exists but misconfigured",
  exists_disabled: "Exists but disabled", partially_verified: "Partially verified", not_found: "Not found",
  permission_blocked: "Permission blocked", unable_to_determine: "Unable to determine", not_applicable: "Not applicable",
};

const AV = ["#3b82f6", "#22c55e", "#a855f7", "#06b6d4", "#f59e0b", "#ec4899", "#14b8a6", "#f97316"];
function avColor(n: string): string { let h = 0; for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0; return AV[h % AV.length]; }

function ago(iso: string | null): string {
  if (!iso) return "never run";
  const d = Date.now() - new Date(iso).getTime();
  const days = Math.floor(d / 86400000);
  if (days > 0) return `${days}d ago`;
  const h = Math.floor(d / 3600000);
  if (h > 0) return `${h}h ago`;
  const m = Math.floor(d / 60000);
  return m > 0 ? `${m}m ago` : "just now";
}

export default function ManageCustom({ checks: initial }: { checks: CustomCheck[] }) {
  const [checks, setChecks] = useState(initial);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tested, setTested] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function removeConnector(connectorId: string) {
    setBusy(connectorId); setErr(null);
    try {
      await call({ action: "delete_connector", connectorId });
      setChecks((cs) => cs.filter((c) => c.connectorId !== connectorId));
      setConfirmId(null);
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't remove the connector."); } finally { setBusy(null); }
  }

  const RemoveControl = ({ connectorId, system }: { connectorId: string; system: string }) =>
    confirmId === connectorId ? (
      <span className="flex items-center gap-2 text-[11px]">
        <span className="text-[var(--muted)]">Remove {system} &amp; delete its key?</span>
        <button onClick={() => removeConnector(connectorId)} disabled={busy === connectorId} className="font-semibold text-[#ef4444] disabled:opacity-50">{busy === connectorId ? "Removing…" : "Yes, remove"}</button>
        <button onClick={() => setConfirmId(null)} className="text-[var(--faint)]">cancel</button>
      </span>
    ) : (
      <button onClick={() => setConfirmId(connectorId)} className="text-[11px] font-semibold text-[var(--faint)] hover:text-[#ef4444]">Remove</button>
    );

  async function call(body: Record<string, unknown>) {
    const res = await fetch("/api/composer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof json?.error === "string" ? json.error : "Something went wrong.");
    return json;
  }

  async function run(checkId: string) {
    setBusy(checkId); setErr(null);
    try {
      const json = await call({ action: "run", checkId });
      setChecks((cs) => cs.map((c) => (c.checkId === checkId ? { ...c, lastRollup: json.rollup, lastState: json.state, lastRunAt: new Date().toISOString(), findings: json.findings ?? c.findings } : c)));
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't run the verification."); } finally { setBusy(null); }
  }

  async function testConnection(connectorId: string) {
    setBusy(connectorId); setErr(null);
    try {
      const json = await call({ action: "test_connector", connectorId });
      setTested((t) => ({ ...t, [connectorId]: { ok: Boolean(json.ok), message: json.message } }));
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't test the connection."); } finally { setBusy(null); }
  }

  if (checks.length === 0) {
    return (
      <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-4 text-[12.5px] text-[var(--muted)]">
        No custom integrations yet. Build one above — once you connect it, it appears here to test, run, and manage.
      </div>
    );
  }

  const pill = (bg: string, color: string, text: string) => (
    <span className="ml-auto rounded px-2 py-1 text-[11px] font-bold" style={{ background: bg, color }}>{text}</span>
  );

  return (
    <div className="flex flex-col gap-2">
      {err && <div className="rounded-md border border-[#e5484d55] bg-[#e5484d14] px-3 py-2 text-[12px] text-[#e5484d]">{err}</div>}
      <div className="grid gap-3.5 md:grid-cols-2">
        {checks.map((c, idx) => {
          const col = avColor(c.systemName);

          // connector added for later use — no check; offer a read-only connection test
          if (c.connectorOnly || !c.checkId) {
            const t = c.connectorId ? tested[c.connectorId] : undefined;
            return (
              <Card key={`co-${idx}-${c.systemName}`} accent={col} className="flex flex-col">
                <div className="flex items-center gap-2.5">
                  <BrandMark id={c.systemName} name={c.systemName} accent={col} />
                  <span className="text-[15px] font-semibold text-[var(--text)]">{c.systemName}</span>
                  {pill("var(--panel)", "var(--accent,#06d6d6)", "Connected")}
                </div>
                <p className="mt-2.5 text-[12.5px] leading-relaxed text-[var(--muted)]">Read-only connector ready. It verifies live the moment a use case maps a control to {c.systemName}.</p>
                {t && (
                  <div className="mt-3 flex items-start gap-2 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-[12px]">
                    <span className="text-[13px]" style={{ color: t.ok ? "#22c55e" : "#f59e0b" }}>{t.ok ? "✓" : "!"}</span><span className="text-[var(--text)]">{t.message}</span>
                  </div>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {c.connectorId && <RemoveControl connectorId={c.connectorId} system={c.systemName} />}
                  {c.connectorId && (
                    <button onClick={() => testConnection(c.connectorId!)} disabled={busy === c.connectorId} className="ml-auto rounded-md bg-[#3b82f6] px-3.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">
                      {busy === c.connectorId ? "Testing…" : "Test connection"}
                    </button>
                  )}
                </div>
              </Card>
            );
          }

          const roll = c.lastRollup ?? "na";
          const neverRun = !c.lastRunAt;
          const stale = c.expiresAt ? new Date(c.expiresAt).getTime() < Date.now() : false;
          const open = openId === c.checkId;
          return (
            <Card key={c.checkId} accent={col} className="flex flex-col">
              <div className="flex items-center gap-2.5">
                <BrandMark id={c.systemName} name={c.systemName} accent={col} />
                <span className="text-[15px] font-semibold text-[var(--text)]">{c.systemName}</span>
                {pill(`${ROLLUP_C[roll]}1f`, ROLLUP_C[roll], ROLLUP_LABEL[roll] ?? roll)}
              </div>
              <p className="mt-2.5 text-[12.5px] leading-relaxed text-[var(--muted)]">{c.controlText ?? c.name}</p>
              <div className="mt-1 text-[11px] text-[var(--faint)]">
                Last run {ago(c.lastRunAt)}{stale && !neverRun ? " · stale" : ""}
              </div>

              {open && (
                <div className="mt-3 flex flex-col gap-3 border-t border-[var(--border)] pt-3">
                  {c.plainSummary && (
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--faint)]">What this checks</div>
                      <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text)]">{c.plainSummary}</p>
                    </div>
                  )}
                  {c.findings && c.findings.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--faint)]">Last result · {STATE_LABEL[c.lastState ?? ""] ?? c.lastState}</div>
                      {c.findings.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-[12.5px] text-[var(--text)]">
                          <span className="text-[13px]" style={{ color: f.pass ? "#22c55e" : "#ef4444" }}>{f.pass ? "✓" : "✗"}</span>{f.label}
                          <span className="ml-auto text-[10.5px] text-[var(--faint)]">{f.proves}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button onClick={() => setOpenId(open ? null : c.checkId)} className="rounded bg-[var(--panel)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--muted)] hover:text-[var(--text)]">
                  {open ? "Close" : "Manage"}
                </button>
                {c.connectorId && <RemoveControl connectorId={c.connectorId} system={c.systemName} />}
                <button onClick={() => run(c.checkId)} disabled={busy === c.checkId} className="ml-auto rounded-md bg-[#3b82f6] px-3.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">
                  {busy === c.checkId ? "Running…" : neverRun ? "Run verification" : "Re-verify"}
                </button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
