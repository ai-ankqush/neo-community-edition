"use client";

import { useState } from "react";
import { BRAND } from "@/lib/brand";

/**
 * Live Fire — stepped, human-in-the-loop. Neo plans the attack, then fires ONE
 * step at a time. Every step is previewed (what it attempts · what happens if it
 * works · blast radius) and waits for the human to Proceed. A step that could
 * disrupt the live service can't fire without a typed acknowledgement — liability
 * sits with the person who types it. Attempt-and-detect: Neo never executes a
 * destructive action, it only detects whether the AI would.
 */

type Step = { index: number; battery: string; ref: string; title: string; intent: string; consequence: string; risk: "safe" | "caution" | "dangerous"; owasp: string; atlas: string };
type Result = { battery: string; attack_ref: string; title: string; owasp_ref: string; atlas_ref: string; verdict: string; severity: string; judge_reason: string; mapped_control: string; remediation: string; transcript: { role: string; text: string }[] };

const METHODS = [{ key: "endpoint", label: "Endpoint" }, { key: "mcp", label: "MCP server" }, { key: "public", label: "Public" }];
const V = (v: string) => v === "confirmed" ? { c: "#ef4444", t: "exploited" } : v === "blocked" ? { c: "#22c55e", t: "held" } : { c: "#f59e0b", t: "unclear" };
const RISK: Record<string, { c: string; t: string }> = { safe: { c: "#22c55e", t: "safe" }, caution: { c: "#f59e0b", t: "caution" }, dangerous: { c: "#ef4444", t: "may disrupt service" } };

export default function LiveFireConsole({ useCases, hasIntegration = false }: { useCases: { id: string; name: string }[]; hasIntegration?: boolean }) {
  const [ucId, setUcId] = useState(useCases[0]?.id ?? "");
  const [method, setMethod] = useState("endpoint");
  const [url, setUrl] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [runId, setRunId] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [cursor, setCursor] = useState(0);
  const [results, setResults] = useState<Record<number, Result>>({});
  const [done, setDone] = useState(false);
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [ack, setAck] = useState(false);

  // Serious authorization gate — not a toggle. Typed target + two attestations + an
  // arming phrase, all captured into the authorization note the server records & audits.
  const [authOpen, setAuthOpen] = useState(false);
  const [authTarget, setAuthTarget] = useState("");
  const [authAck1, setAuthAck1] = useState(false);
  const [authAck2, setAuthAck2] = useState(false);
  const [authPhrase, setAuthPhrase] = useState("");
  const [authNote, setAuthNote] = useState<string | null>(null);
  function deauthorize() { setAuthorized(false); setAuthNote(null); }

  const needsUrl = method === "endpoint" || method === "public" || method === "mcp"; // MCP = the MCP server's HTTP URL
  const ucName = useCases.find((u) => u.id === ucId)?.name ?? "Generic AI";
  const targetLabel = url.trim() || "the target";
  const ARM_PHRASE = "AUTHORIZE LIVE FIRE";
  // Endpoint needs a managed connection. Public + MCP (attacked by URL) are exempt.
  const noIntegration = method === "endpoint" && !hasIntegration;
  const step = steps[cursor] ?? null;

  async function plan() {
    setError(null);
    if (noIntegration) { setError(`No integration in place. Connect ${BRAND.name} to your AI first, or use a public endpoint.`); return; }
    if (!authorized) { setError("Confirm you're authorized to test this AI."); return; }
    if (needsUrl && !url.trim()) { setError("Add the target URL."); return; }
    setBusy(true); setRunId(null); setSteps([]); setResults({}); setCursor(0); setDone(false);
    try {
      const res = await fetch("/api/red-team/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ use_case_id: ucId || null, target_method: method, authorized: true, authorization_note: authNote }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not start");
      setRunId(json.runId); setReason(json.selectionReason); setSteps(json.steps ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not start"); } finally { setBusy(false); }
  }

  async function fire(index: number, confirmed = false) {
    if (!runId) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/red-team/run/${runId}/step`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ index, target_method: method, target_url: url.trim() || null, use_case_id: ucId || null, confirmed }) });
      const json = await res.json();
      if (res.status === 428) { setConfirmOpen(true); return; }
      if (!res.ok) throw new Error(json.error ?? "Step failed");
      setResults((r) => ({ ...r, [index]: json.result }));
      setConfirmOpen(false); setConfirmText(""); setAck(false);
      if (json.done) setDone(true); else setCursor(index + 1);
    } catch (e) { setError(e instanceof Error ? e.message : "Step failed"); } finally { setBusy(false); }
  }

  function proceed() {
    if (!step) return;
    if (step.risk === "dangerous") { setConfirmOpen(true); return; }
    fire(cursor);
  }

  const field = "rounded-md border border-[var(--border)] bg-[var(--panel)] px-2.5 py-2 text-[12.5px] text-[var(--text)] outline-none focus:border-[#3b82f6]";
  const fired = Object.keys(results).length;

  return (
    <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-4">
      {/* command bar */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="relative flex h-2 w-2"><span className={`absolute inline-flex h-full w-full rounded-full ${busy ? "animate-ping bg-[#ef4444]" : "bg-[#22c55e]"} opacity-75`} /><span className={`relative inline-flex h-2 w-2 rounded-full ${busy ? "bg-[#ef4444]" : "bg-[#22c55e]"}`} /></span>
        <span className="text-[13px] font-semibold text-[var(--text)]">Live Fire</span>
        <select value={ucId} onChange={(e) => { setUcId(e.target.value); deauthorize(); }} className={`${field} min-w-[150px] flex-1`}>
          <option value="">Generic AI</option>
          {useCases.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select value={method} onChange={(e) => { setMethod(e.target.value); deauthorize(); }} className={field}>
          {METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        {authorized ? (
          <span className="flex items-center gap-1.5 rounded-md border border-[#22c55e66] bg-[#22c55e14] px-2.5 py-2 text-[12px] font-semibold text-[#22c55e]">
            ✓ Authorized
            <button onClick={deauthorize} title="Revoke authorization" className="text-[var(--muted)] hover:text-[var(--text)]">✕</button>
          </span>
        ) : (
          <button onClick={() => { setAuthTarget(""); setAuthAck1(false); setAuthAck2(false); setAuthPhrase(""); setAuthOpen(true); }} disabled={noIntegration}
            className="flex items-center gap-1.5 rounded-md border border-[#ef444466] bg-[#ef444414] px-2.5 py-2 text-[12px] font-semibold text-[#ef4444] disabled:opacity-50">
            <span>⚠</span> Authorize
          </button>
        )}
        <button onClick={plan} disabled={busy || noIntegration || !authorized} title={!authorized ? "Authorize the target first" : undefined} className="rounded-md bg-[#ef4444] px-4 py-2 text-[12.5px] font-bold text-white transition hover:bg-[#dc2626] disabled:opacity-50">{runId ? "Restart" : "Attack"}</button>
      </div>
      {noIntegration ? (
        <p className="mt-2 text-[12px] text-[#f59e0b]">No integration in place — <a href="/dashboard/integrations" className="underline">connect {BRAND.name} to your AI</a>, or switch to a public endpoint. To see the attacks without a live system, use <a href="/dashboard/red-team?view=sim" className="underline">Simulation</a>.</p>
      ) : needsUrl ? (
        <input value={url} onChange={(e) => { setUrl(e.target.value); deauthorize(); }} placeholder={method === "mcp" ? "https://your-mcp-server.example.com/mcp" : "https://your-ai.example.com/chat"} className={`${field} mt-2 w-full`} />
      ) : null}
      {error && <p className="mt-2 text-[12px] text-[#ef4444]">{error}</p>}

      {reason && runId && (
        <p className="mt-3 text-[11.5px] text-[var(--faint)]" title={reason}><span className="font-semibold text-[#06d6d6]">Judgement</span> · {reason} · {steps.length} steps, one at a time</p>
      )}

      {/* stepped feed */}
      {runId && (
        <div className="mt-2 flex flex-col">
          {/* fired steps */}
          {steps.filter((s) => results[s.index]).map((s) => {
            const r = results[s.index]; const vv = V(r.verdict); const isOpen = openIdx === s.index;
            return (
              <div key={s.index} className="border-t border-[var(--border)]">
                <button onClick={() => setOpenIdx(isOpen ? null : s.index)} className="flex w-full items-center gap-2.5 py-2.5 text-left">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: vv.c }} />
                  <span className="flex-1 text-[12.5px] text-[var(--text)]">{s.title}</span>
                  <span className="hidden sm:inline text-[10px] font-mono text-[var(--faint)]">{r.owasp_ref}</span>
                  <span className="text-[11.5px] font-semibold" style={{ color: vv.c }}>{vv.t}</span>
                </button>
                {isOpen && (
                  <div className="pb-3 pl-[18px]">
                    {r.judge_reason && <p className="mb-2 text-[11.5px] text-[var(--muted)]">{r.judge_reason}</p>}
                    {r.transcript.map((t, i) => (
                      <div key={i} className="mb-1.5 rounded-[7px] border border-[var(--border)] bg-[var(--panel)] p-2">
                        <div className="text-[9.5px] font-bold uppercase tracking-wide" style={{ color: t.role === "attacker" ? "#ef4444" : "#06d6d6" }}>{t.role === "attacker" ? `${BRAND.name}` : "target"}</div>
                        <p className="mt-0.5 whitespace-pre-wrap text-[11.5px] leading-relaxed text-[var(--text)]">{t.text}</p>
                      </div>
                    ))}
                    {r.verdict === "confirmed" && r.remediation && <p className="mt-1.5 text-[11.5px]"><span className="font-semibold text-[#22c55e]">Fix</span> · {r.remediation}</p>}
                  </div>
                )}
              </div>
            );
          })}

          {/* current step — preview + gate */}
          {!done && step && (
            <div className="mt-2 rounded-[10px] border p-3" style={{ borderColor: `${RISK[step.risk].c}55`, background: `${RISK[step.risk].c}0c` }}>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-[var(--faint)]">Step {cursor + 1} of {steps.length}</span>
                <span className="text-[13px] font-semibold text-[var(--text)]">{step.title}</span>
                <span className="ml-auto rounded px-2 py-0.5 text-[10px] font-bold uppercase" style={{ color: RISK[step.risk].c, background: `${RISK[step.risk].c}1f` }}>{RISK[step.risk].t}</span>
              </div>
              <p className="mt-1.5 text-[12px] text-[var(--muted)]"><span className="font-semibold text-[var(--text)]">{BRAND.name} will</span> {step.intent}</p>
              <p className="mt-0.5 text-[12px] text-[var(--muted)]"><span className="font-semibold text-[var(--text)]">If it works</span> {step.consequence}</p>
              <div className="mt-2.5 flex items-center gap-2">
                <button onClick={proceed} disabled={busy} className="rounded-md px-4 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50"
                  style={{ background: step.risk === "dangerous" ? "#ef4444" : "#3b82f6" }}>
                  {busy ? "Running…" : step.risk === "dangerous" ? "Review & acknowledge" : "Proceed"}
                </button>
                <span className="text-[11px] text-[var(--faint)]">nothing fires until you proceed</span>
              </div>
            </div>
          )}

          {done && (
            <div className="mt-2 flex items-center gap-3 border-t border-[var(--border)] pt-2.5 text-[11.5px]">
              <span style={{ color: "#ef4444" }}>{Object.values(results).filter((r) => r.verdict === "confirmed").length} exploited</span>
              <span style={{ color: "#22c55e" }}>{Object.values(results).filter((r) => r.verdict === "blocked").length} held</span>
              <span className="ml-auto text-[var(--faint)]">{fired} steps · saved to Findings · no action executed</span>
            </div>
          )}
        </div>
      )}

      {/* AUTHORIZATION GATE — serious, typed, attested, audited. Not a toggle. */}
      {authOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4" onClick={() => !busy && setAuthOpen(false)}>
          <div className="w-full max-w-lg rounded-[12px] border-2 border-[#ef4444] bg-[var(--surface)] p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2"><span className="text-[19px]">⚠</span><h3 className="text-[16px] font-bold text-[var(--text)]">Authorize a live attack</h3></div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--muted)]">
              You are about to direct {BRAND.name} to launch <b className="text-[var(--text)]">real adversarial attacks against a live system</b>. {BRAND.name} attempts-and-detects — it will not execute a destructive action — but it sends genuine hostile input to a running target, which can disrupt, expose, or degrade it. <b className="text-[#ef4444]">This is not a simulation.</b>
            </p>

            <div className="mt-3 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-[12px]">
              <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--faint)]">Target</div>
              <div className="mt-0.5 break-all font-mono text-[var(--text)]">{targetLabel}</div>
              <div className="text-[11px] text-[var(--muted)]">via {method}{ucId ? ` · ${ucName}` : ""}</div>
            </div>

            {needsUrl && (
              <>
                <p className="mt-3 text-[11.5px] font-semibold text-[var(--muted)]">Type the target URL to confirm you mean this exact system</p>
                <input value={authTarget} onChange={(e) => setAuthTarget(e.target.value)} placeholder={url || "https://…"} className={`${field} mt-1 w-full`} />
              </>
            )}

            <label className="mt-3 flex items-start gap-2 text-[12px] text-[var(--muted)]">
              <input type="checkbox" checked={authAck1} onChange={(e) => setAuthAck1(e.target.checked)} className="mt-0.5" />
              I own this system, or I have <b className="text-[var(--text)]">explicit authorization from its owner</b> to security-test it.
            </label>
            <label className="mt-2 flex items-start gap-2 text-[12px] text-[var(--muted)]">
              <input type="checkbox" checked={authAck2} onChange={(e) => setAuthAck2(e.target.checked)} className="mt-0.5" />
              I understand this runs against a <b className="text-[var(--text)]">live system</b> and I accept responsibility for any impact.
            </label>

            <p className="mt-3 text-[11.5px] font-semibold text-[var(--muted)]">Type <span className="font-mono text-[#ef4444]">{ARM_PHRASE}</span> to arm</p>
            <input value={authPhrase} onChange={(e) => setAuthPhrase(e.target.value)} placeholder={ARM_PHRASE} className={`${field} mt-1 w-full font-mono`} />

            <div className="mt-4 flex items-center justify-between gap-2">
              <span className="text-[10.5px] text-[var(--faint)]">Recorded to your audit log — who, target, when.</span>
              <div className="flex gap-2">
                <button onClick={() => setAuthOpen(false)} className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--muted)]">Cancel</button>
                <button
                  onClick={() => {
                    setAuthNote(`Live fire authorized against ${targetLabel} via ${method}${ucId ? ` (use case: ${ucName})` : ""}. Ownership/authorization attested; responsibility accepted; arming phrase confirmed.`);
                    setAuthorized(true); setAuthOpen(false);
                  }}
                  disabled={!authAck1 || !authAck2 || authPhrase.trim() !== ARM_PHRASE || (needsUrl && authTarget.trim() !== url.trim())}
                  className="rounded-md bg-[#ef4444] px-4 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-40">Authorize &amp; arm</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* dangerous-step acknowledgement */}
      {confirmOpen && step && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onClick={() => !busy && setConfirmOpen(false)}>
          <div className="w-full max-w-md rounded-[12px] border border-[#ef444455] bg-[var(--surface)] p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2"><span className="text-[#ef4444]">⚠</span><h3 className="text-[15px] font-bold text-[var(--text)]">This step may disrupt the service</h3></div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--muted)]">{step.consequence} {BRAND.name} attempts and detects — it does not execute the action — but you are authorizing a live attack on a running system. <b className="text-[var(--text)]">By acknowledging, you accept responsibility for this step.</b></p>
            <p className="mt-3 text-[11.5px] font-semibold text-[var(--muted)]">Type <span className="font-mono text-[var(--text)]">confirm</span> to proceed</p>
            <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="confirm" className={`${field} mt-1 w-full`} />
            <label className="mt-3 flex items-start gap-2 text-[12px] text-[var(--muted)]">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" />
              I acknowledge this runs against a live system and accept the liability.
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => { setConfirmOpen(false); setConfirmText(""); setAck(false); }} className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--muted)]">Cancel</button>
              <button onClick={() => fire(cursor, true)} disabled={busy || confirmText.trim().toLowerCase() !== "confirm" || !ack}
                className="rounded-md bg-[#ef4444] px-4 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-40">{busy ? "Firing…" : "Acknowledge & fire"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
