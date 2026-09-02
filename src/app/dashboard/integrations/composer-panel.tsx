"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ComposerCandidate } from "@/lib/composer-context";
import { BRAND } from "@/lib/brand";

type Cond = { label: string; path: string; op: string; value?: unknown; proves: string; negate?: boolean };
type Preflight = { vendor_url?: string; steps: string[] };
type ConnInput = { key: string; label: string; help?: string; secret: boolean; example?: string };
type Proposal = { name: string; system_name: string; base_url: string; auth_type: "api_token" | "custom_header" | "oauth2_client_credentials"; auth_help: string; inputs?: ConnInput[]; preflight?: Preflight; path: string; query?: Record<string, string>; assertion: { conditions: Cond[] }; plain_summary: string };

const AV_COLORS = ["#3b82f6", "#22c55e", "#a855f7", "#06b6d4", "#f59e0b", "#ec4899", "#14b8a6", "#f97316"];
function avInitials(n: string): string { const p = n.trim().split(/\s+/); return ((p[0]?.[0] ?? "") + (p[1] ? p[1][0] : (p[0]?.[1] ?? ""))).toUpperCase(); }
function avColor(n: string): string { let h = 0; for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0; return AV_COLORS[h % AV_COLORS.length]; }

export default function ComposerPanel({
  candidates = [],
  catalog = [],
  preselectTech = "",
  existingConnectors = [],
}: {
  candidates?: ComposerCandidate[];
  catalog?: { name: string; category: string }[];
  preselectTech?: string;
  existingConnectors?: { id: string; systemName: string; baseUrl: string }[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<"pick" | "build" | "done">("pick");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showTech, setShowTech] = useState(false);

  // what the user is composing for
  const [systemName, setSystemName] = useState("");
  const [controlText, setControlText] = useState("");
  const [boundControlIds, setBoundControlIds] = useState<string[]>([]); // controls this result will write back to
  const [boundUseCaseId, setBoundUseCaseId] = useState<string | null>(null);
  const [typed, setTyped] = useState("");

  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({}); // one value per declared input (token + ids)
  const [baseUrl, setBaseUrl] = useState(""); // editable — Neo prefills, customer can fix
  const [doneName, setDoneName] = useState("");
  const [connectorOnly, setConnectorOnly] = useState(false); // add a connector with no control/check

  // inline Ask Neo — contextual help while setting up an integration
  const [askQ, setAskQ] = useState("");
  const [askBusy, setAskBusy] = useState(false);
  const [askThread, setAskThread] = useState<{ q: string; a: string }[]>([]);

  const inputCls = "w-full rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--faint)]";
  const selected = systemName.trim();
  const selectedCand = candidates.find((c) => c.tech.toLowerCase() === selected.toLowerCase());

  // Effective control context — derived from the selected candidate so the flow works the SAME
  // whether the tech was chosen via a card, the dropdown, the autocomplete, or typed exactly.
  const candControlText = selectedCand && selectedCand.controls.length
    ? `Verify the following control${selectedCand.controls.length > 1 ? "s" : ""} in ${selectedCand.tech}: ${selectedCand.controls.map((x) => x.control).join("; ")}`
    : "";
  const effControlText = controlText.trim() || candControlText;
  const effBoundIds = boundControlIds.length ? boundControlIds : (selectedCand?.controls.map((c) => c.id) ?? []);
  const effUseCaseId = boundUseCaseId ?? selectedCand?.useCaseIds[0] ?? null;

  // an existing org-level connector for the selected system → reuse it, don't re-ask for the key
  const reuseConn = existingConnectors.find((c) => c.systemName.trim().toLowerCase() === selected.toLowerCase());

  const selectCandidate = (c: ComposerCandidate) => {
    setSystemName(c.tech);
    setBoundControlIds(c.controls.map((x) => x.id));
    setBoundUseCaseId(c.useCaseIds[0] ?? null);
    setControlText(
      c.controls.length
        ? `Verify the following control${c.controls.length > 1 ? "s" : ""} in ${c.tech}: ${c.controls.map((x) => x.control).join("; ")}`
        : "",
    );
    setErr(null);
  };

  // Choose a tech by name (autocomplete pick / free-text match) — binds controls if it's a candidate.
  const pickByName = (name: string) => {
    const hit = candidates.find((c) => c.tech.toLowerCase() === name.trim().toLowerCase());
    if (hit) selectCandidate(hit);
    else { setSystemName(name); setBoundControlIds([]); setBoundUseCaseId(null); setControlText(""); }
  };

  // honor a deep-link from the Controls page (?compose=Airtable)
  useEffect(() => {
    if (!preselectTech) return;
    const hit = candidates.find((c) => c.tech.toLowerCase() === preselectTech.toLowerCase());
    if (hit) selectCandidate(hit);
    else { setSystemName(preselectTech); setTyped(preselectTech); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectTech]);

  // Search-driven picker: filter the org's candidate techs; surface catalog/long-tail on search.
  const q = typed.trim().toLowerCase();
  const filteredCands = candidates.filter((c) => !q || c.tech.toLowerCase().includes(q) || c.category.toLowerCase().includes(q));
  const shownCands = q ? filteredCands : filteredCands.slice(0, 8);
  const moreCount = q ? 0 : Math.max(0, filteredCands.length - shownCands.length);
  const catalogHits = q.length >= 2
    ? catalog.filter((t) => t.name.toLowerCase().includes(q) && !candidates.some((c) => c.tech.toLowerCase() === t.name.toLowerCase())).slice(0, 4)
    : [];
  const showCompose = q.length >= 2
    && !candidates.some((c) => c.tech.toLowerCase() === q)
    && !catalog.some((t) => t.name.toLowerCase() === q);

  async function call(body: Record<string, unknown>) {
    const res = await fetch("/api/composer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = json?.error;
      const msg = typeof e === "string" ? e
        : Array.isArray(e) ? e.map((i) => (i?.path ? `${i.path.join(".")}: ` : "") + (i?.message ?? "invalid")).join("; ")
        : `Request failed (${res.status}).`;
      throw new Error(msg);
    }
    return json;
  }

  async function buildConnector() {
    if (!selected || busy) return;
    // No control to verify → we're just adding a connector for later use.
    const isConnectorOnly = !effControlText;
    const ctForGen = effControlText || `Read-only connectivity to ${selected}`;
    setBusy(true); setErr(null);
    try {
      const { proposal } = await call({ action: "generate", systemName: selected, controlText: ctForGen });
      setProposal(proposal); setVals({}); setBaseUrl(proposal.base_url || ""); setConnectorOnly(isConnectorOnly); setStep("build"); setShowTech(false);
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't work out what this connector needs. Try again, or pick a different system."); } finally { setBusy(false); }
  }

  // Connect = save the connector + check only. Verification (preflight/run) happens
  // from the connector's tile under "Manage existing", so build and verify stay separate.
  async function connect() {
    if (!proposal || busy) return;
    const inputs = proposal.inputs ?? [];
    const reuse = Boolean(reuseConn) && !connectorOnly; // reuse the existing connector + only add the check
    const placeholders = proposal.path + JSON.stringify(proposal.query ?? {});
    const subst = (s: string) => s.replace(/\{(\w+)\}/g, (m, k) => {
      const inp = inputs.find((i) => i.key === k && !i.secret);
      return inp ? encodeURIComponent((vals[k] ?? "").trim()) : m;
    });

    if (reuse) {
      // only the non-secret ids the check path actually needs (the connector already holds the key)
      const needed = inputs.filter((i) => !i.secret && placeholders.includes(`{${i.key}}`));
      const missing = needed.filter((i) => !(vals[i.key] ?? "").trim()).map((i) => i.label);
      if (missing.length) { setErr(`Please fill in: ${missing.join(", ")}.`); return; }
      setBusy(true); setErr(null);
      try {
        await call({
          action: "save", connectorId: reuseConn!.id, name: proposal.name, systemName: proposal.system_name,
          controlText: effControlText, useCaseId: effUseCaseId, controlItemId: effBoundIds[0] ?? null,
          path: subst(proposal.path),
          query: proposal.query ? Object.fromEntries(Object.entries(proposal.query).map(([k, v]) => [k, subst(v)])) : undefined,
          assertion: proposal.assertion, plainSummary: proposal.plain_summary,
        });
        setDoneName(proposal.system_name); setStep("done"); router.refresh();
      } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't add the check. Try again."); } finally { setBusy(false); }
      return;
    }

    // new connector — every declared input must be filled
    const missing = inputs.filter((i) => !(vals[i.key] ?? "").trim()).map((i) => i.label);
    if (missing.length) { setErr(`Please fill in: ${missing.join(", ")}.`); return; }
    const finalBase = subst(baseUrl.trim());
    if (!/^https:\/\/.+/i.test(finalBase)) { setErr("Add the system's API base URL (must start with https://) before connecting."); return; }
    const finalPath = subst(proposal.path);
    const finalQuery = proposal.query ? Object.fromEntries(Object.entries(proposal.query).map(([k, v]) => [k, subst(v)])) : undefined;

    const secret = inputs.find((i) => i.secret);
    const secretVal = secret ? (vals[secret.key] ?? "").trim() : "";
    const credential = proposal.auth_type === "oauth2_client_credentials"
      ? { token_url: (vals.token_url ?? "").trim(), client_id: (vals.client_id ?? "").trim(), client_secret: (vals.client_secret ?? "").trim(), scope: (vals.scope ?? "").trim() }
      : proposal.auth_type === "custom_header"
        ? { header_name: (vals.header_name ?? "Authorization").trim(), header_value: secretVal }
        : { token: secretVal };

    setBusy(true); setErr(null);
    try {
      await call({
        action: "save", name: proposal.name, systemName: proposal.system_name, baseUrl: finalBase,
        authType: proposal.auth_type, credential,
        // Omit the check entirely when there's no control — just save the connector for later.
        ...(connectorOnly ? {} : {
          controlText: effControlText, useCaseId: effUseCaseId, controlItemId: effBoundIds[0] ?? null,
          path: finalPath, query: finalQuery, assertion: proposal.assertion, plainSummary: proposal.plain_summary,
        }),
      });
      setDoneName(proposal.system_name);
      setStep("done");
      router.refresh(); // surface the new connector/tile in "Your connectors"
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't connect. Check the details and try again."); } finally { setBusy(false); }
  }

  async function askNeo() {
    const q = askQ.trim();
    if (!q || askBusy) return;
    setAskBusy(true);
    const context = proposal
      ? `Connecting ${proposal.system_name} read-only. ${proposal.plain_summary}\nNeeds: ${(proposal.inputs ?? []).map((i) => i.label).join(", ")}.\nSetup steps: ${(proposal.preflight?.steps ?? []).join(" | ")}`
      : `Setting up a read-only connector for ${selected || systemName}.`;
    try {
      const { answer } = await call({ action: "ask", systemName: selected || systemName || "this system", question: q, context });
      setAskThread((t) => [...t, { q, a: answer }]);
      setAskQ("");
    } catch (e) { setAskThread((t) => [...t, { q, a: e instanceof Error ? e.message : "Sorry — I couldn't answer that just now." }]); } finally { setAskBusy(false); }
  }

  function reset() {
    setStep("pick"); setProposal(null); setDoneName(""); setSystemName(""); setControlText("");
    setBoundControlIds([]); setBoundUseCaseId(null); setTyped(""); setVals({}); setBaseUrl(""); setConnectorOnly(false);
    setAskQ(""); setAskThread([]);
  }

  return (
    <div id="composer" className="scroll-mt-4 rounded-[12px] border border-[var(--accent,#06d6d6)40] bg-[var(--surface)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-4 py-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[var(--accent,#06d6d6)]">{BRAND.name} Integration Composer</div>
          <div className="text-[14px] font-bold text-[var(--text)]">Verify a control in a system {BRAND.name} doesn&apos;t connect to yet</div>
        </div>
        <span className="ml-auto rounded border border-[var(--border)] px-2 py-0.5 text-[10px] font-semibold text-[var(--faint)]">read-only · private testing</span>
      </div>

      {/* guided breadcrumb — stays inside the Composer flow, never back to provider setup */}
      {step !== "pick" && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3 text-[11.5px]">
          <button onClick={reset} className="text-[var(--accent,#06d6d6)] hover:underline">Integration Composer</button>
          <span className="text-[var(--faint)]">›</span>
          {step === "done" ? (
            <button onClick={() => setStep("build")} className="text-[var(--accent,#06d6d6)] hover:underline">Build your integration</button>
          ) : (
            <span className="font-semibold text-[var(--text)]">Build your integration</span>
          )}
          {selected && (<><span className="text-[var(--faint)]">›</span><span className="text-[var(--text)]">{selected}</span></>)}
        </div>
      )}

      {err && <div className="mx-4 mt-3 rounded-md border border-[#e5484d55] bg-[#e5484d14] px-3 py-2 text-[12px] text-[#e5484d]">{err}</div>}

      {step === "pick" && (
        <div className="flex flex-col gap-3 p-4">
          <p className="text-[12.5px] text-[var(--muted)]">Pick a system — {BRAND.name} already knows which control to check from your assessment. Read-only, always.</p>

          {/* search */}
          <div className="relative">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--faint)]"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
            <input
              className={`${inputCls} pl-9`}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Search a system… e.g. Sentinel, Salesforce, Workday"
            />
          </div>

          {/* tiles */}
          <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--faint)]">
            {q ? "Matches" : `Suggested from your stack · no ${BRAND.name} connector yet`}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {shownCands.map((c) => {
              const on = selected.toLowerCase() === c.tech.toLowerCase();
              const col = avColor(c.tech);
              return (
                <button
                  key={c.tech}
                  onClick={() => selectCandidate(c)}
                  className={`flex flex-col gap-2 rounded-[10px] border p-3 text-left transition ${on ? "border-[var(--accent,#06d6d6)] bg-[var(--accent,#06d6d6)0f]" : "border-[var(--border)] bg-[var(--panel)] hover:border-[var(--accent,#06d6d6)80]"}`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-[11px] font-bold" style={{ background: `${col}22`, color: col }}>{avInitials(c.tech)}</span>
                    <div className="min-w-0"><div className="truncate text-[13.5px] font-semibold text-[var(--text)]">{c.tech}</div><div className="text-[11px] text-[var(--faint)]">{c.category}</div></div>
                  </div>
                  <div className="text-[11px] font-semibold text-[var(--accent,#06d6d6)]">{c.controls.length ? `${c.controls.length} control${c.controls.length > 1 ? "s" : ""} mapped` : "Declared in your stack"}</div>
                </button>
              );
            })}

            {catalogHits.map((t) => {
              const col = avColor(t.name);
              return (
                <button
                  key={t.name}
                  onClick={() => pickByName(t.name)}
                  className="flex flex-col gap-2 rounded-[10px] border border-[var(--border)] bg-[var(--panel)] p-3 text-left transition hover:border-[var(--accent,#06d6d6)80]"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-[11px] font-bold" style={{ background: `${col}22`, color: col }}>{avInitials(t.name)}</span>
                    <div className="min-w-0"><div className="truncate text-[13.5px] font-semibold text-[var(--text)]">{t.name}</div><div className="text-[11px] text-[var(--faint)]">{t.category}</div></div>
                  </div>
                  <div className="text-[11px] text-[var(--faint)]">Not in your stack · compose anyway</div>
                </button>
              );
            })}

            {showCompose && (
              <button
                onClick={() => pickByName(typed.trim())}
                className="flex items-center gap-2.5 rounded-[10px] border border-dashed border-[var(--accent,#06d6d6)80] bg-[var(--panel)] p-3 text-left transition hover:bg-[var(--accent,#06d6d6)0f]"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-[var(--accent,#06d6d6)1a] text-[15px] text-[var(--accent,#06d6d6)]">+</span>
                <div><div className="text-[13.5px] font-semibold text-[var(--text)]">Compose &ldquo;{typed.trim()}&rdquo;</div><div className="text-[11px] text-[var(--faint)]">Build a read-only connector for it</div></div>
              </button>
            )}
          </div>

          {moreCount > 0 && <div className="text-[11px] text-[var(--faint)]">+ {moreCount} more in your stack — type to search</div>}
          {q && shownCands.length === 0 && catalogHits.length === 0 && !showCompose && (
            <div className="text-[12.5px] text-[var(--muted)]">No system matches &ldquo;{typed.trim()}&rdquo;.</div>
          )}
          {candidates.length === 0 && !q && (
            <div className="text-[12.5px] text-[var(--muted)]">No long-tail systems detected in your stack yet. Type any system above to compose a connector.</div>
          )}

          {/* once a system is chosen: list mapped controls as identifiers only, or ask (Path C) */}
          {selected && (
            <div className="rounded-[10px] border border-[var(--border)] bg-[var(--panel)] p-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--faint)]">
                {selectedCand?.controls.length ? `${selectedCand.controls.length} control${selectedCand.controls.length > 1 ? "s" : ""} in ${selected}` : `Verify in ${selected}`}
              </div>
              {selectedCand && selectedCand.controls.length > 0 ? (
                <div className="mt-1.5 flex flex-col gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {selectedCand.controls.map((c) => (
                      <span key={c.id} title={c.control} className="rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[10.5px] text-[var(--muted)]">{c.ref}</span>
                    ))}
                  </div>
                  <p className="text-[11px] text-[var(--faint)]">{BRAND.name} identified {selectedCand.controls.length === 1 ? "this control" : "these"} from your assessment — no need to describe it. The live result records against {selectedCand.controls.length === 1 ? "it" : "them"}.</p>
                </div>
              ) : (
                <label className="mt-1.5 flex flex-col gap-1">
                  <span className="text-[11px] text-[var(--muted)]">No control is mapped to {selected} yet. In plain words, what should {BRAND.name} confirm exists? <span className="text-[var(--faint)]">(optional)</span></span>
                  <input className={inputCls} value={controlText} onChange={(e) => setControlText(e.target.value)} placeholder="e.g. Access to records is restricted to named users" />
                  <span className="text-[11px] text-[var(--faint)]">Leave blank to just add the connector for later — you can verify a control against it anytime.</span>
                </label>
              )}
            </div>
          )}

          <button
            onClick={buildConnector}
            disabled={busy || !selected}
            className="mt-1 self-start rounded-md bg-[var(--accent,#06d6d6)] px-4 py-2 text-[13px] font-semibold text-black disabled:opacity-50"
          >
            {busy ? `${BRAND.name} is working out what it needs…` : effControlText ? "Start to build connector →" : "Add a connector →"}
          </button>
        </div>
      )}

      {step === "build" && proposal && (
        <div className="flex flex-col gap-3 p-4">
          <div className="rounded-[10px] border border-[var(--border)] bg-[var(--panel)] p-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--faint)]">{connectorOnly ? `Add the ${proposal.system_name} connector` : `Building the ${proposal.system_name} connector`}</div>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--text)]">{connectorOnly ? `Connect ${proposal.system_name} read-only now. Later, when a use case maps a control to it, ${BRAND.name} can verify it live without you re-entering anything.` : proposal.plain_summary}</p>
            {!connectorOnly && <button onClick={() => setShowTech((v) => !v)} className="mt-2 text-[11px] font-semibold text-[var(--accent,#06d6d6)]">{showTech ? "Hide technical details" : "Show technical details"}</button>}
            {!connectorOnly && showTech && (
              <pre className="mt-2 overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--bg)] p-2 text-[10.5px] text-[var(--muted)]">{`GET ${proposal.base_url}${proposal.path}${proposal.query ? "?" + new URLSearchParams(proposal.query).toString() : ""}\n\nassertion:\n${JSON.stringify(proposal.assertion, null, 2)}`}</pre>
            )}
          </div>

          {/* What you'll need — Neo lists the prerequisites and where to get them (skip when reusing a connector) */}
          {!(reuseConn && !connectorOnly) && proposal.preflight && (proposal.preflight.steps?.length || proposal.preflight.vendor_url) && (
            <div className="rounded-[10px] border border-[#f59e0b40] bg-[#f59e0b0d] p-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-[#f59e0b]">Before you connect — make sure you have these</div>
              <p className="mt-1 text-[12.5px] text-[var(--muted)]">Everything below is <span className="font-semibold text-[var(--text)]">read-only</span>. You only paste it — {BRAND.name} never sees your password and never writes to {proposal.system_name}.</p>
              {proposal.preflight.steps?.length > 0 && (
                <ol className="mt-2 flex flex-col gap-1">
                  {proposal.preflight.steps.map((s, i) => (
                    <li key={i} className="flex gap-2 text-[12.5px] text-[var(--text)]">
                      <span className="flex shrink-0 items-center justify-center rounded-full border border-[#f59e0b] text-[10px] font-bold text-[#f59e0b]" style={{ height: 18, width: 18 }}>{i + 1}</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
              )}
              {proposal.preflight.vendor_url && (
                <a href={proposal.preflight.vendor_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-[12px] font-semibold text-[#f59e0b]">Open {proposal.system_name} ↗</a>
              )}
            </div>
          )}

          {reuseConn && !connectorOnly ? (
            <div className="rounded-[10px] border border-[#22c55e40] bg-[#22c55e0d] p-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-[#22c55e]">Using your existing {proposal.system_name} connector</div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--muted)]">{BRAND.name} won&apos;t ask for the key again — it reuses the read-only connector you already set up.</p>
              {/* only ask for ids the check itself needs (e.g. a specific list/object id) */}
              {(proposal.inputs ?? []).filter((inp) => !inp.secret && (proposal.path + JSON.stringify(proposal.query ?? {})).includes(`{${inp.key}}`)).map((inp) => (
                <label key={inp.key} className="mt-3 flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-[var(--muted)]">{inp.label}</span>
                  {inp.help && <span className="text-[11px] leading-snug text-[var(--faint)]">{inp.help}</span>}
                  <input className={inputCls} value={vals[inp.key] ?? ""} onChange={(e) => setVals((p) => ({ ...p, [inp.key]: e.target.value }))} placeholder={inp.example ? `e.g. ${inp.example}` : ""} />
                </label>
              ))}
            </div>
          ) : (
            <div className="rounded-[10px] border border-[var(--border)] bg-[var(--panel)] p-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--faint)]">Fill in the connection details</div>
              {proposal.auth_help && <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--muted)]">{proposal.auth_help}</p>}

              <label className="mt-3 flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-[var(--muted)]">API base URL {!proposal.base_url && <span className="text-[#f59e0b]">· {BRAND.name} wasn&apos;t sure — paste it</span>}</span>
                <input className={inputCls} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.your-system.com" />
              </label>

              {/* one field per value Neo asked for — token AND any ids (subscription, workspace…) */}
              {(proposal.inputs ?? []).map((inp) => (
                <label key={inp.key} className="mt-3 flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-[var(--muted)]">{inp.label}</span>
                  {inp.help && <span className="text-[11px] leading-snug text-[var(--faint)]">{inp.help}</span>}
                  <input
                    className={inputCls}
                    type={inp.secret ? "password" : "text"}
                    value={vals[inp.key] ?? ""}
                    onChange={(e) => setVals((p) => ({ ...p, [inp.key]: e.target.value }))}
                    placeholder={inp.example ? `e.g. ${inp.example}` : inp.secret ? "Paste the read-only value" : ""}
                  />
                </label>
              ))}
            </div>
          )}

          {/* inline Ask Neo — stuck on a field? just ask */}
          <div className="rounded-[10px] border border-[var(--accent,#06d6d6)33] bg-[var(--accent,#06d6d6)0a] p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--accent,#06d6d6)]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5"><path d="M12 3a9 9 0 0 0-9 9c0 1.6.4 3 1.2 4.3L3 21l4.7-1.2A9 9 0 1 0 12 3Z" /></svg>
              Ask {BRAND.name} about this integration
            </div>
            {askThread.length > 0 && (
              <div className="mt-2 flex flex-col gap-2">
                {askThread.map((t, i) => (
                  <div key={i}>
                    <div className="text-[11.5px] font-semibold text-[var(--text)]">{t.q}</div>
                    <div className="mt-0.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-[var(--muted)]">{t.a}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2 flex gap-2">
              <input
                className={inputCls}
                value={askQ}
                onChange={(e) => setAskQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") askNeo(); }}
                placeholder={`e.g. where do I find the ${proposal.system_name} token?`}
              />
              <button onClick={askNeo} disabled={askBusy || !askQ.trim()} className="shrink-0 rounded-md border border-[var(--accent,#06d6d6)] px-3 py-2 text-[12.5px] font-semibold text-[var(--accent,#06d6d6)] disabled:opacity-50">{askBusy ? "Asking…" : "Ask"}</button>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={() => setStep("pick")} className="rounded-md border border-[var(--border)] px-3 py-2 text-[12.5px] font-semibold text-[var(--muted)]">← Back</button>
            <button onClick={connect} disabled={busy} className="rounded-md bg-[var(--accent,#06d6d6)] px-4 py-2 text-[13px] font-semibold text-black disabled:opacity-50">{busy ? "Working…" : reuseConn && !connectorOnly ? "Add check & verify →" : "Connect →"}</button>
          </div>
          <p className="text-[11px] text-[var(--faint)]">Connecting saves the connector and creates a tile under <span className="font-semibold">Your connectors</span>.{connectorOnly ? " It'll be ready to verify the moment a control needs it." : " You run the live verification from the tile."}</p>
        </div>
      )}

      {step === "done" && (
        <div className="flex flex-col gap-3 p-4">
          <div className="rounded-[10px] border border-[#22c55e40] bg-[#22c55e0d] p-4">
            <div className="text-[14px] font-bold text-[var(--text)]">✓ {doneName} connector {connectorOnly ? "added" : "created"}</div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--muted)]">
              It&apos;s now under <span className="font-semibold text-[var(--text)]">Your connectors</span> below.
              {connectorOnly
                ? ` It's connected read-only and ready — when a use case maps a control to this system, ${BRAND.name} can verify it live.`
                : <> Open the tile and hit <span className="font-semibold text-[var(--text)]">Run verification</span> to check your live system — read-only.</>}
            </p>
          </div>
          <button onClick={reset} className="self-start rounded-md border border-[var(--border)] px-3 py-2 text-[12.5px] font-semibold text-[var(--muted)]">Add another</button>
        </div>
      )}
    </div>
  );
}
