"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardLabel, StatusDot, RecBadge, Th, Td } from "@/components/console/ui";
import { PILLAR_NAMES } from "@/components/console/theme";
import { CAPABILITIES } from "@/server/fabric/capabilities";
import { techForControl, type StackSelection } from "@/lib/tech-catalog";
import { BRAND } from "@/lib/brand";

// connector id → display name, so a control's verifying tech is legible in the Controls tab
const PROVIDER_LABEL: Record<string, string> = {
  github: "GitHub", openai: "OpenAI", anthropic: "Anthropic", langsmith: "LangSmith",
  okta: "Okta", entra: "Entra ID", google_workspace: "Google Workspace",
  aws: "AWS", gcp: "GCP", azure: "Azure", servicenow: "ServiceNow", jira: "Jira",
  splunk: "Splunk", vault: "Vault", snowflake: "Snowflake", databricks: "Databricks",
  purview: "Purview", datadog: "Datadog",
};
const provName = (p: string) => PROVIDER_LABEL[p] ?? p;
// A capability can be satisfied by several connectors, but a control usually names ONE
// (e.g. "via Okta SSO"). Show only the provider(s) the control actually names; if it names
// none, fall back to the full list (those are the real options).
function shownProviders(providers: string[], controlText: string): string[] {
  const t = (controlText ?? "").toLowerCase();
  const named = providers.filter((p) => t.includes(p.split("_")[0]));
  return named.length ? named : providers;
}
import TestStatusSelect from "@/components/console/test-status-select";
import ControlStatusSelect from "@/components/console/control-status-select";
import ProofCard from "./proof-card";
import EvidenceAttach from "./evidence-attach";
import ContextPanel, { type CtxEntry } from "./context-panel";
import RedTeamPanel, { type RedTeamFinding } from "./red-team-panel";

const TAB_LABEL: Record<string, string> = {
  overview: "Overview", risk: "Risk", questions: "Context", controls: "Controls",
  evidence: "Evidence", tests: "Tests", decision: "Decision", red_team: "Red Team",
};

const VERIFY_META: Record<string, { label: string; color: string; icon: string }> = {
  verified: { label: "Verified", color: "#22c55e", icon: "✓" },
  partial: { label: "Partially exists", color: "#f59e0b", icon: "◐" },
  missing: { label: "Does not exist", color: "#ef4444", icon: "✗" },
  not_checked: { label: "Not checked", color: "var(--faint)", icon: "○" },
};

interface ClassifyOut {
  rationale?: string; see?: string[]; decide?: string[]; do?: string[];
  autonomyLevel?: number; patterns?: string[]; openQuestions?: string[];
}
interface RiskDriver { area: string; rating: string; reason: string }
interface TierOut {
  rationale?: string; punchline?: string; reallyIs?: string; topRisk?: string;
  overlookedRisk?: string; failureMode?: string; evidenceGap?: string;
  riskDrivers?: (RiskDriver | string)[];
  escalationTriggers?: { id: string; trigger: string; newTier: number | string }[];
}

const RATING_VALUE: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };
const RATING_COLOR: Record<string, string> = {
  Critical: "#ef4444", High: "#f97316", Medium: "#f59e0b", Low: "#22c55e",
};
interface Control {
  id: string; pillar: number; control: string; why: string | null;
  requirement: string; status: string;
  stack_implementation?: string | null; evidence?: string | null;
  assurance_test?: string | null;
  verification_status?: string | null; verification_note?: string | null;
  verified_at?: string | null;
  capability_id?: string | null;
  evidence_url?: string | null;
}
type LiveEv = { result: string; rawArtifactRef?: string | null; remediationHint?: string | null; checkedAt?: string | null; validUntil?: string | null; provider?: string | null; note?: string | null };
interface Evidence { id: string; title: string; status: string }
interface Test { id: string; objective: string; method: string | null; expected: string | null; owner: string | null; result: string; evidence_url?: string | null }
interface Condition { id: string; text: string; owner: string | null; consequence: string | null; status: string }
interface Approval { decision: string; rationale: string | null }
interface Question { id: string; text: string; answer: string | null; status: string }

export default function UCTabs({
  tier, classify, tierOut, questions = [], controls, evidence, tests, conditions, approval,
  canVerify = false, liveVerify = false, canAct = false,
  useCaseId, ucName = "", contextEntries = [], canRedTeam = false, redTeamFindings = [], decisionSlot,
  liveControlsEnabled = false, connectedCapabilities = [], liveByControl = {}, stack = null,
  disputed = {},
}: {
  tier: number | null;
  classify: ClassifyOut | null;
  tierOut: TierOut | null;
  questions?: Question[];
  controls: Control[];
  evidence: Evidence[];
  tests: Test[];
  conditions: Condition[];
  approval: Approval | null;
  canVerify?: boolean;   // plan has manual verification AND user can act
  liveVerify?: boolean;  // enterprise: live connectors
  canAct?: boolean;      // assessor/admin (role) - edits tests regardless of plan
  useCaseId: string;
  ucName?: string;
  contextEntries?: CtxEntry[];
  canRedTeam?: boolean;
  redTeamFindings?: RedTeamFinding[];
  decisionSlot?: React.ReactNode;
  liveControlsEnabled?: boolean;
  connectedCapabilities?: string[];
  stack?: StackSelection | null;
  liveByControl?: Record<string, LiveEv>;
  /** controlId → Neo's open objection to it. A disagreement about a control belongs ON the control,
   *  not only at the top of the page — that's where anyone would go looking for it. */
  disputed?: Record<string, { claim: string; reason: string; confidence: number }>;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const requestedTab = sp.get("tab");
  const VALID_TABS = ["overview", "risk", "questions", "controls", "evidence", "tests", "decision", "red_team"];
  const [tab, setTab] = useState(requestedTab && VALID_TABS.includes(requestedTab) ? requestedTab : "overview");
  const [verifying, setVerifying] = useState<string | null>(null);
  const [verifyingGroup, setVerifyingGroup] = useState<string | null>(null);
  // Evidence tab: per-tech groups are collapsible, collapsed (+) by default for a clean scan.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (k: string) =>
    setExpandedGroups((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n;
    });
  // Controls + Tests tabs: JS-driven collapse with a visible +/− (no CSS-variant dependency).
  const [expandedControls, setExpandedControls] = useState<Set<string>>(new Set());
  const toggleControl = (id: string) =>
    setExpandedControls((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const [expandedTests, setExpandedTests] = useState<Set<string>>(new Set());
  const toggleTest = (id: string) =>
    setExpandedTests((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // Tech-grouped verify: one call per tech that fans out to every live control under it.
  // Runs each control's capability check (idempotent) and refreshes — each control still gets
  // its own honest pass/fail; the grouping is purely about collapsing N buttons into one.
  async function verifyGroup(key: string, ids: string[]) {
    if (verifyingGroup || ids.length === 0) return;
    setVerifyingGroup(key);
    await Promise.all(ids.map((id) => fetch(`/api/controls/${id}/verify`, { method: "POST" }).catch(() => null)));
    setVerifyingGroup(null);
    router.refresh();
  }

  async function attest(controlId: string, status: string) {
    const promptText =
      status === "verified"
        ? "What evidence proves this control exists? (config export, screenshot, policy name, log sample, ticket...)"
        : status === "partial"
          ? "What exists today, and what still needs modification?"
          : "What's missing, and what would close the gap?";
    const note = prompt(promptText) ?? undefined;
    if (note === undefined) return; // cancelled
    setVerifying(controlId);
    await fetch(`/api/controls/${controlId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verificationStatus: status, note }),
    });
    setVerifying(null);
    router.refresh();
  }
  const tabs = ["overview", "risk", "questions", "controls", "evidence", "tests", "decision", ...(canRedTeam ? ["red_team"] : [])];

  // Risk drivers: the factor-by-factor assessment from the tier stage
  const drivers = (tierOut?.riskDrivers ?? []).filter(
    (d): d is RiskDriver => typeof d === "object" && d !== null && "area" in d
  );

  return (
    <div className="mt-8 flex flex-col gap-4">
      <div className="flex gap-0.5 rounded-lg bg-[var(--panel)] p-[3px]">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-md px-3 py-2 text-xs ${
              tab === t ? "bg-[var(--border)] font-semibold text-[var(--text)]" : "text-[var(--faint)]"
            }`}
          >
            {TAB_LABEL[t] ?? t}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <Card>
            <div className="mb-1 text-xs uppercase text-[var(--faint)]">What this really is</div>
            <div className="text-sm leading-relaxed">{tierOut?.reallyIs ?? classify?.rationale ?? "Pending assessment."}</div>
          </Card>
          <Card>
            <div className="mb-1 text-xs uppercase text-[var(--faint)]">Most Important Risk</div>
            <div className="text-sm leading-relaxed text-[#f59e0b]">{tierOut?.topRisk ?? "—"}</div>
          </Card>
          <Card>
            <div className="mb-1 text-xs uppercase text-[var(--faint)]">Most Overlooked Risk</div>
            <div className="text-sm leading-relaxed text-[#f97316]">{tierOut?.overlookedRisk ?? "—"}</div>
          </Card>
          <Card>
            <div className="mb-1 text-xs uppercase text-[var(--faint)]">Most Likely Failure Mode</div>
            <div className="text-sm leading-relaxed text-[#ef4444]">{tierOut?.failureMode ?? "—"}</div>
          </Card>
          <Card>
            <div className="mb-1 text-xs uppercase text-[var(--faint)]">Top Evidence Gap</div>
            <div className="text-sm leading-relaxed text-[#f59e0b]">{tierOut?.evidenceGap ?? "—"}</div>
          </Card>
          <Card>
            <div className="mb-2 text-xs uppercase text-[var(--faint)]">Authority profile</div>
            <div className="mb-2 text-xs text-[var(--muted)]">
              Autonomy{" "}
              {classify?.autonomyLevel != null ? (
                <b className="text-[var(--text)]">{classify.autonomyLevel}/5</b>
              ) : "—"}{" "}
              · {(classify?.patterns ?? []).join(" / ")}
            </div>
            <AuthorityList label="SEE" items={classify?.see ?? []} color="#3b82f6" />
            <AuthorityList label="DECIDE" items={classify?.decide ?? []} color="#f59e0b" />
            <AuthorityList label="DO" items={classify?.do ?? []} color="#f97316" />
          </Card>
        </div>
      )}

      {tab === "risk" && (
        <div className="space-y-3.5">
        <Card>
          <CardLabel>Why this is Tier {tier ?? "—"}</CardLabel>
          {tierOut?.rationale && (
            <p className="mb-4 mt-2 whitespace-pre-line text-[13.5px] leading-relaxed text-[var(--text)]">{tierOut.rationale}</p>
          )}
          <p className="mb-5 mt-1 text-[13px] leading-relaxed text-[var(--muted)]">
            The factors the assessment weighed to set the risk tier. Each is scored Low → Critical
            with the reasoning — the longer and redder the bar, the more it pushes risk up.
          </p>
          <div className="flex flex-col gap-4">
            {drivers.map((r, i) => {
              const color = RATING_COLOR[r.rating] ?? "var(--faint)";
              const pct = ((RATING_VALUE[r.rating] ?? 1) / 4) * 100;
              return (
                <div key={i}>
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <span className="text-[13px] font-medium text-[var(--text)]">{r.area}</span>
                    <span
                      className="shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold"
                      style={{ color, background: `${color}18`, border: `1px solid ${color}30` }}
                    >
                      {r.rating}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--panel)]">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                  </div>
                  {r.reason && <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">{r.reason}</p>}
                </div>
              );
            })}
            {drivers.length === 0 &&
              (tierOut?.riskDrivers ?? []).map((r, i) =>
                typeof r === "string" ? (
                  <div key={i} className="border-b border-[var(--border)] pb-2 text-[13px] leading-relaxed text-[var(--text)]">{r}</div>
                ) : null
              )}
            {(tierOut?.riskDrivers ?? []).length === 0 && (
              <p className="text-sm text-[var(--faint)]">Risk drivers appear once the tier stage is accepted.</p>
            )}
          </div>
        </Card>
        {(tierOut?.escalationTriggers ?? []).length > 0 && (
          <Card>
            <div className="mb-3 text-xs uppercase text-[var(--faint)]">
              Would increase tier if... <span className="normal-case">(escalation triggers - locked out of current scope)</span>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {(tierOut?.escalationTriggers ?? []).map((t) => (
                <div key={t.id} className="flex items-start gap-3 py-2.5">
                  <span className="mt-0.5 shrink-0 rounded border border-[var(--border)] bg-[var(--panel)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--muted)]">{t.id}</span>
                  <span className="flex-1 text-[13px] leading-relaxed text-[var(--text)]">{t.trigger}</span>
                  <span className="mt-0.5 shrink-0 rounded px-2 py-0.5 text-[11px] font-bold" style={{ color: "#f97316", background: "#f973161f", border: "1px solid #f9731640" }}>→ Tier {t.newTier}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
        </div>
      )}

      {tab === "questions" && (
        <Card>
          <CardLabel>Context</CardLabel>
          <p className="mb-2 mt-1 text-[13px] text-[var(--muted)]">
            The living context for this use case. Edit answers or add new detail at any time.
          </p>
          <p className="mb-4 rounded-md border border-[#3b82f640] bg-[#3b82f60d] px-3 py-2 text-[12.5px] text-[var(--text)]">
            Any change to context or answers triggers a re-assessment: regenerate the affected stages to refresh
            the classification, tier, and controls. Your saved control, evidence, and assurance statuses are
            preserved when stages are regenerated.
          </p>
          <ContextPanel useCaseId={useCaseId} questions={questions} entries={contextEntries} canEdit={canAct} />
        </Card>
      )}

      {tab === "red_team" && (
        <Card>
          <CardLabel>Red Team</CardLabel>
          <p className="mb-4 mt-1 text-[13px] text-[var(--muted)]">
            Run the Red Team engine on this AI. Each finding is a concrete attack path scored against your current control posture. Watch the animated replay and attack it live in <a href="/dashboard/red-team" className="text-[#3b82f6] hover:underline">Red Team → Live Fire</a>.
          </p>
          <RedTeamPanel useCaseId={useCaseId} ucName={ucName} findings={redTeamFindings} canRun={canAct} />
        </Card>
      )}

      {tab === "controls" && (
        <div className="space-y-2.5">
          {controls.length > 0 && (
            <div className="flex items-center gap-3 px-4 pb-1 text-[10px] font-bold uppercase tracking-wide text-[var(--faint)]">
              <span className="w-32 shrink-0">Pillar</span>
              <span className="min-w-0 flex-1">Control</span>
              <span className="w-36 shrink-0">Tech (configure in)</span>
              <span className="w-28 shrink-0 text-center">Verification</span>
              <span className="w-20 shrink-0 text-right">Level</span>
              <span className="w-24 shrink-0">Status</span>
              <span className="w-3 shrink-0" />
            </div>
          )}
          {controls.map((c) => { const open = expandedControls.has(c.id); return (
            <div key={c.id} className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)]">
              <button type="button" onClick={() => toggleControl(c.id)} className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left">
                <span className="w-32 shrink-0 truncate text-[11px] text-[var(--faint)]" title={`Pillar ${c.pillar}: ${PILLAR_NAMES[c.pillar]}`}>
                  {c.pillar}. {PILLAR_NAMES[c.pillar]}
                </span>
                <span className="min-w-0 flex-1 break-words text-[13px] font-medium text-[var(--text)]">{c.control}</span>
                {(() => {
                  const techs = techForControl(c.control, stack);
                  return (
                    <span className="w-36 shrink-0 truncate text-[11px] text-[#60a5fa]"
                      title={techs.length ? `Configure in ${techs.join(", ")}` : "No specific tech named"}>
                      {techs.length ? techs[0] : "—"}
                    </span>
                  );
                })()}
                {(() => {
                  const v = VERIFY_META[c.verification_status ?? "not_checked"];
                  return (
                    <span
                      className="w-28 shrink-0 whitespace-nowrap rounded px-2 py-0.5 text-center text-[11px] font-bold"
                      style={{ color: v.color, background: `${v.color}1a`, border: `1px solid ${v.color}35` }}
                      title={c.verification_note ?? undefined}
                    >
                      {v.icon} {v.label}
                    </span>
                  );
                })()}
                {/* Neo disputes this row. Small, calm, unmissable — a colleague clearing their
                    throat, not an alarm. The full argument is one click away at the top of the page. */}
                {disputed[c.id] && (
                  <span
                    className="w-24 shrink-0 whitespace-nowrap rounded px-2 py-0.5 text-center text-[11px] font-bold"
                    style={{ color: "#ef4444", background: "#ef44441a", border: "1px solid #ef444435" }}
                    title={disputed[c.id].claim}
                  >
                    ✦ {BRAND.name} disputes
                  </span>
                )}
                <span className="w-20 shrink-0 text-right text-[11px] text-[var(--muted)]">{c.requirement}</span>
                <span className="w-24 shrink-0"><StatusDot status={c.status} /></span>
                <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center self-start rounded border border-[var(--border)] text-[12px] font-bold leading-none text-[var(--faint)]">
                  {open ? "−" : "+"}
                </span>
              </button>
              {open && (
              <div className="space-y-3 border-t border-[var(--border)] px-4 py-3.5 text-[13px]">
                {/* Neo's objection to THIS control, stated where the claim was made. */}
                {disputed[c.id] && (
                  <div className="rounded-[8px] border border-[#ef444440] bg-[#ef44440d] px-3 py-2.5">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-[#ef4444]">
                      ✦ {BRAND.name} disputes this — {Math.round(disputed[c.id].confidence * 100)}% confident
                    </p>
                    <p className="mt-1 text-[12.5px] font-semibold text-[var(--text)]">{disputed[c.id].claim}</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-[var(--muted)]">{disputed[c.id].reason}</p>
                    <a href="#neo-dissent" className="mt-1.5 inline-block text-[11.5px] font-semibold text-[#3b82f6] hover:underline">
                      Answer it — accept or overrule ↑
                    </a>
                  </div>
                )}
                {c.why && (
                  <p className="text-[var(--muted)]"><b className="text-[var(--text)]">Why:</b> {c.why}</p>
                )}
                <div className="rounded-md border border-[#3b82f630] bg-[#3b82f60d] p-3">
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[#3b82f6]">
                    Implement (your stack)
                  </p>
                  <p className="leading-relaxed text-[var(--text)]">
                    {c.stack_implementation ?? "Generated before stack-aware mapping - rewind to Controls to regenerate."}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border border-[#22c55e30] bg-[#22c55e0d] p-3">
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--good)]">
                      Evidence this produces
                    </p>
                    <p className="leading-relaxed text-[var(--muted)]">{c.evidence ?? "—"}</p>
                  </div>
                  <div className="rounded-md border border-[#f59e0b30] bg-[#f59e0b0d] p-3">
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[#f59e0b]">
                      How to verify
                    </p>
                    <p className="leading-relaxed text-[var(--muted)]">{c.assurance_test ?? "—"}</p>
                  </div>
                </div>

                {/* manual implementation tracking - all plans */}
                <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--faint)]">
                    Implementation:
                  </span>
                  <ControlStatusSelect controlId={c.id} status={c.status} canEdit={canAct} />
                  <span className="text-[11px] text-[#4b5563]">Track by hand until a connector can verify it.</span>
                </div>

                <p className="text-[11px] text-[#4b5563]">Verify this control under the Evidence tab — live scan, manual attach, and attestation.</p>
              </div>
              )}
            </div>
          ); })}
          {controls.length === 0 && (
            <Card><p className="py-4 text-center text-sm text-[var(--faint)]">Controls appear after the controls stage is accepted.</p></Card>
          )}
        </div>
      )}

      {tab === "evidence" && (
        <div className="space-y-5">
          {controls.length === 0 ? (
            <Card><p className="py-4 text-center text-sm text-[var(--faint)]">Evidence appears once the controls stage is accepted.</p></Card>
          ) : (() => {
            // Group controls by the tech they're configured in / verified through, so verification
            // is one action per tech (one Okta call fans out to every Okta control) rather than one
            // button per control. Key precedence: declared-stack tech the control names → else the
            // capability's verifying provider → else a no-integration "Manual" bucket (shown last).
            const keyFor = (c: Control): string => {
              const techs = techForControl(c.control, stack);
              if (techs.length) return techs[0];
              if (c.capability_id) {
                const prov = liveByControl[c.id]?.provider ?? CAPABILITIES[c.capability_id]?.providers?.[0];
                if (prov) return provName(prov);
              }
              return "__manual__";
            };
            const groups = new Map<string, Control[]>();
            for (const c of controls) {
              const k = keyFor(c);
              const arr = groups.get(k);
              if (arr) arr.push(c); else groups.set(k, [c]);
            }
            const entries = [...groups.entries()].sort((a, b) =>
              a[0] === "__manual__" ? 1 : b[0] === "__manual__" ? -1 : 0
            );

            return entries.map(([key, groupControls]) => {
              const techName = key === "__manual__" ? "Manual — no integration" : key;
              const liveIds = groupControls
                .filter((c) => c.capability_id && liveControlsEnabled && connectedCapabilities.includes(c.capability_id))
                .map((c) => c.id);
              const isCollapsed = !expandedGroups.has(key);
              return (
                <div key={key} className="space-y-2.5">
                  {/* tech / connection header — click +/− to collapse; one verify action fans out below */}
                  <div className="flex items-center gap-2 border-b border-[var(--border)] pb-1.5">
                    <button type="button" onClick={() => toggleGroup(key)}
                      className="flex items-center gap-2 text-left"
                      title={isCollapsed ? `Expand ${techName}` : `Collapse ${techName}`}>
                      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border border-[var(--border)] text-[12px] font-bold leading-none text-[var(--faint)]">
                        {isCollapsed ? "+" : "−"}
                      </span>
                      <span className="text-[13px] font-bold text-[#60a5fa]">{techName}</span>
                      <span className="text-[11px] text-[var(--faint)]">· {groupControls.length} control{groupControls.length > 1 ? "s" : ""}</span>
                    </button>
                    {liveIds.length > 0 && canAct && (
                      <button onClick={() => verifyGroup(key, liveIds)} disabled={verifyingGroup === key}
                        className="ml-auto rounded-md bg-[#3b82f6] px-3 py-1 text-[11px] font-semibold text-white disabled:opacity-50">
                        {verifyingGroup === key ? "Checking…" : `Verify via ${techName} (${liveIds.length})`}
                      </button>
                    )}
                  </div>
                  {!isCollapsed && groupControls.map((c) => {
                    const live = Boolean(c.capability_id && liveControlsEnabled && connectedCapabilities.includes(c.capability_id));
                    return (
                    <div key={c.id} className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-3.5">
                      {live ? (
                        <ProofCard
                          controlId={c.id}
                          pillar={c.pillar}
                          pillarName={PILLAR_NAMES[c.pillar]}
                          controlName={c.control}
                          requirement={c.requirement}
                          code={c.stack_implementation ?? null}
                          canVerify={canAct}
                          initial={liveByControl[c.id] ?? null}
                        />
                      ) : (
                        <>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] text-[var(--faint)]">{c.pillar}. {PILLAR_NAMES[c.pillar]}</span>
                            <span className="text-[13px] font-medium text-[var(--text)]">{c.control}</span>
                          </div>
                          {c.evidence && <p className="mt-1 text-[12px] text-[var(--muted)]"><b className="text-[var(--text)]">Should prove:</b> {c.evidence}</p>}
                          {c.capability_id ? (
                            liveControlsEnabled ? (
                              <div className="mt-2 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-[12px] text-[var(--faint)]">
                                Auto-verifiable via {shownProviders(CAPABILITIES[c.capability_id]?.providers ?? [], c.control).map(provName).join(" / ")} — <a href="/dashboard/integrations" className="text-[#3b82f6] underline">connect it</a> to check live.
                              </div>
                            ) : (
                              <div className="mt-2 text-[12px] text-[var(--faint)]">Auto-verifiable once live verification is enabled.</div>
                            )
                          ) : (
                            <EvidenceAttach manual endpoint={`/api/controls/${c.id}`} initialUrl={c.evidence_url ?? null} initialNote={c.verification_note ?? null} withNote canEdit={canVerify} />
                          )}
                        </>
                      )}

                      {canVerify && (
                        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-2.5">
                          <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--faint)]">Attest:</span>
                          {(["verified", "partial", "missing"] as const).map((s) => {
                            const v = VERIFY_META[s];
                            return (
                              <button key={s} onClick={() => attest(c.id, s)} disabled={verifying === c.id}
                                className="rounded border px-2.5 py-1 text-[11px] font-semibold disabled:opacity-50"
                                style={c.verification_status === s
                                  ? { color: v.color, background: `${v.color}1f`, borderColor: `${v.color}60` }
                                  : { color: "var(--muted)", borderColor: "var(--border)" }}>
                                {v.icon} {v.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              );
            });
          })()}
        </div>
      )}

      {tab === "tests" && (
        <div className="space-y-3">
          {tests.map((t) => (
            <Card key={t.id}>
              <div className="flex items-center justify-between gap-3">
                <button type="button" onClick={() => toggleTest(t.id)} className="flex min-w-0 items-center gap-2 text-left">
                  <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border border-[var(--border)] text-[12px] font-bold leading-none text-[var(--faint)]">{expandedTests.has(t.id) ? "−" : "+"}</span>
                  <span className="text-sm font-semibold">{t.objective}</span>
                </button>
                <TestStatusSelect testId={t.id} result={t.result} canEdit={canAct} />
              </div>
              {expandedTests.has(t.id) && (
                <>
                  {t.method && <p className="mt-2 text-[13px] text-[var(--muted)]"><b className="text-[var(--text)]">Method:</b> {t.method}</p>}
                  {t.expected && <p className="mt-1 text-[13px] text-[var(--muted)]"><b className="text-[var(--text)]">Expected:</b> {t.expected}</p>}
                  {t.owner && <p className="mt-1 text-xs text-[var(--faint)]">Owner: {t.owner}</p>}
                  <EvidenceAttach endpoint={`/api/tests/${t.id}`} initialUrl={t.evidence_url ?? null} canEdit={canAct} />
                </>
              )}
            </Card>
          ))}
          {tests.length === 0 && (
            <Card><p className="text-sm text-[var(--faint)]">The test plan appears after the assurance stage is accepted.</p></Card>
          )}
        </div>
      )}

      {tab === "decision" && (
        <div className="space-y-3.5">
          {decisionSlot}
          {conditions.length > 0 && (
            <Card className="overflow-x-auto p-0">
              <table className="w-full min-w-[640px] text-[13px]">
                <thead className="bg-[var(--panel)]">
                  <tr><Th>Condition</Th><Th>Owner</Th><Th>If not met</Th><Th>Status</Th></tr>
                </thead>
                <tbody>
                  {conditions.map((c) => (
                    <tr key={c.id} className="hover:bg-[var(--panel-hover)]">
                      <Td>{c.text}</Td>
                      <Td className="whitespace-nowrap text-[var(--muted)]">{c.owner ?? "—"}</Td>
                      <Td className="text-[var(--muted)]">{c.consequence ?? "—"}</Td>
                      <Td className="whitespace-nowrap"><StatusDot status={c.status} /></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function AuthorityList({ label, items, color }: { label: string; items: string[]; color: string }) {
  return (
    <div className="mb-2.5">
      <span className="text-[11px] font-bold" style={{ color }}>{label}</span>
      <ul className="mt-0.5 space-y-0.5 text-xs text-[var(--muted)]">
        {items.slice(0, 4).map((i, k) => <li key={k}>• {i}</li>)}
        {items.length === 0 && <li>—</li>}
      </ul>
    </div>
  );
}
