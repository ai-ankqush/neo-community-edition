/** Neo Red Team v2 — grounded attack-path engine.
 *
 *  Not an LLM threat list. It instantiates KNOWN attack patterns (templates) against the
 *  use case's ACTUAL authority graph (real nodes + edges), maps the controls that break
 *  each step, and only calls a step "blocked" when the breaking control is actually
 *  VERIFIED ("proof, not paperwork"). Applicability, residual and before/after are
 *  deterministic; no LLM judgement. Pure + client-safe — reuses the derived authority
 *  graph, no DB, no migration. */

import type { AuthorityGraph, GraphNode } from "./ai-authority-graph";

export type ControlStatus = "verified" | "partial" | "recommended" | "missing";
export type EffectType = "breaks" | "reduces" | "detects";
export type Applicability = "strong" | "moderate" | "weak";
export type EdgeResidual = "open" | "detected" | "reduced" | "blocked";
export type AttackEdgeType =
  | "injects_into" | "poisons_context" | "retrieves_sensitive_data" | "manipulates_output"
  | "externalizes_data" | "triggers_action" | "influences_decision" | "abuses_identity"
  | "inherits_vendor_risk" | "changes_behavior" | "persists_memory" | "evades_logging";

export interface RTControl { pillar: number | null; control: string; capability_id?: string | null; verification_status?: string | null }

interface Archetype { key: string; label: string; effect: EffectType; edges: AttackEdgeType[]; rx: RegExp; caps?: string[] }

const ARCHETYPES: Archetype[] = [
  { key: "source_trust", label: "Retrieval source-trust / provenance", effect: "reduces", edges: ["injects_into", "poisons_context"], rx: /source[- ]?trust|provenance|trusted source|content sanitiz|untrusted (content|source|document)|quarantine/i },
  { key: "retrieval_boundary", label: "Retrieval scope / boundary", effect: "reduces", edges: ["poisons_context", "retrieves_sensitive_data"], rx: /retrieval (scope|boundary)|scoped retrieval|per[- ]?user (filter|retrieval)|access[- ]?scoped retrieval/i },
  { key: "identity_retrieval", label: "Identity-aware retrieval", effect: "reduces", edges: ["retrieves_sensitive_data"], rx: /identity[- ]?aware retrieval|permission[- ]?(scoped|inherit)|acl.*retriev|row[- ]?level/i },
  { key: "input_filter", label: "Prompt-injection / input filter", effect: "reduces", edges: ["injects_into"], rx: /prompt[- ]?injection|input validation|instruction hierarchy|input sanitiz/i },
  { key: "output_validation", label: "Output validation", effect: "reduces", edges: ["manipulates_output"], rx: /output (validation|filter|moderation|guardrail)|response validation|validate.*output|grounded(ness)? check|citation/i },
  { key: "dlp_redaction", label: "DLP / output redaction", effect: "reduces", edges: ["retrieves_sensitive_data", "externalizes_data"], rx: /\bdlp\b|data loss prevention|redact|mask(ing)?|sensitive[- ]?data filter|egress filter/i, caps: ["dlp_policy_enforced"] },
  { key: "human_approval", label: "Human approval before action", effect: "breaks", edges: ["triggers_action", "influences_decision"], rx: /human (approval|review|in[- ]?the[- ]?loop|accountab)|approval (gate|before|workflow)|manual review|four[- ]?eyes/i },
  { key: "scoped_credentials", label: "Least-privilege / scoped tool credentials", effect: "reduces", edges: ["triggers_action", "abuses_identity"], rx: /least[- ]?privilege|scoped (credential|token|tool)|tool allowlist|rate limit|circuit breaker/i },
  { key: "vendor_review", label: "Vendor AI review / commitments", effect: "reduces", edges: ["inherits_vendor_risk"], rx: /vendor (ai )?(review|assessment)|no[- ]?training (clause|commitment)|retention (clause|commitment)|subprocessor|third[- ]?party (ai )?review/i },
  { key: "change_control", label: "Version pinning / change control", effect: "reduces", edges: ["changes_behavior", "inherits_vendor_risk"], rx: /version pin|change (approval|control|notification|notice)|model[- ]?change|digest (pin|verif)|re[- ]?attest|deployment approval/i },
  { key: "memory_control", label: "Memory scope / review / reset", effect: "reduces", edges: ["persists_memory"], rx: /memory (scope|expiry|review|reset|control)|state reset|clear (memory|context)|session isolation/i },
  { key: "logging", label: "Prompt / output / action logging", effect: "detects", edges: ["manipulates_output", "injects_into", "triggers_action", "evades_logging"], rx: /prompt.*log|output.*log|action.*log|audit log|logging|siem|tamper[- ]?evident|log retention|observab/i, caps: ["siem_event_forwarding"] },
];

const SENSITIVE = /hr|employee|payroll|health|medical|patient|pii|personal|customer|financial|finance|salary|ssn|confidential|legal|case/i;
const EDGE_LABEL: Record<AttackEdgeType, string> = {
  injects_into: "injects into", poisons_context: "poisons context", retrieves_sensitive_data: "retrieves sensitive data",
  manipulates_output: "manipulates output", externalizes_data: "externalizes data", triggers_action: "triggers action",
  influences_decision: "influences decision", abuses_identity: "abuses identity", inherits_vendor_risk: "inherits vendor risk",
  changes_behavior: "changes behaviour", persists_memory: "persists in memory", evades_logging: "evades logging",
};

function statusForArchetype(a: Archetype, controls: RTControl[]): ControlStatus {
  const matches = controls.filter((c) => (a.caps && c.capability_id && a.caps.includes(c.capability_id)) || (typeof c.control === "string" && a.rx.test(c.control)));
  if (matches.length === 0) return "missing";
  if (matches.some((c) => c.verification_status === "verified")) return "verified";
  if (matches.some((c) => c.verification_status === "partial")) return "partial";
  return "recommended";
}

export interface RTNode { id: string; name: string; role: string; placeholder?: boolean }
export interface RTControlRef { key: string; label: string; effect: EffectType; status: ControlStatus }
export interface RTEdge { types: AttackEdgeType[]; label: string; from: string; to: string; controls: RTControlRef[]; residual: EdgeResidual; residualAfter: EdgeResidual }
export interface RedTeamPath {
  id: string; templateKey: string; title: string; category: string; objective: string;
  applicability: Applicability; impact: "low" | "moderate" | "high" | "critical";
  owasp: string[]; atlas: string[];
  whyApplies: string; attackerGets: string[];
  nodes: RTNode[]; edges: RTEdge[]; controls: RTControlRef[];
  residual: { label: string; tone: "open" | "partial" | "reduced" | "blocked" };
  residualAfter: { label: string; tone: "open" | "partial" | "reduced" | "blocked" };
  counts: { verified: number; partial: number; recommended: number; missing: number };
  recommendation: string;
}

function edgeResidual(refs: RTControlRef[], assumeVerified: boolean): EdgeResidual {
  const eff = (e: EffectType, ok: (s: ControlStatus) => boolean) => refs.some((r) => r.effect === e && (assumeVerified ? r.status !== "missing" : ok(r.status)));
  if (eff("breaks", (s) => s === "verified")) return "blocked";
  if (eff("reduces", (s) => s === "verified" || s === "partial")) return "reduced";
  if (eff("detects", (s) => s === "verified")) return "detected";
  return "open";
}

function refsFor(types: AttackEdgeType[], controls: RTControl[]): RTControlRef[] {
  const m = new Map<string, RTControlRef>();
  for (const a of ARCHETYPES) if (a.edges.some((e) => types.includes(e)) && !m.has(a.key)) m.set(a.key, { key: a.key, label: a.label, effect: a.effect, status: statusForArchetype(a, controls) });
  return [...m.values()];
}

function pathResidual(open: number, total: number, terminal: EdgeResidual): RedTeamPath["residual"] {
  if (terminal === "blocked" && open === 0) return { label: "Blocked by verified control", tone: "blocked" };
  if (terminal === "blocked") return { label: "Partially reduced", tone: "partial" };
  if (open === 0) return { label: "Materially reduced", tone: "reduced" };
  if (open >= total) return { label: "Unmitigated", tone: "open" };
  return { label: "Partially reduced", tone: "partial" };
}

interface ChainStep { types: AttackEdgeType[]; from: number; to: number; label?: string }
interface TemplateMeta {
  id: string; title: string; category: string; objective: string; owasp: string[]; atlas: string[];
  impact: RedTeamPath["impact"]; whyApplies: string; attackerGets: string[]; recommendation: string;
}

function finalize(meta: TemplateMeta, applicability: Applicability, nodes: RTNode[], chain: ChainStep[], controls: RTControl[]): RedTeamPath {
  const edges: RTEdge[] = chain.map((c) => {
    const refs = refsFor(c.types, controls);
    return {
      types: c.types, label: c.label ?? c.types.map((t) => EDGE_LABEL[t]).join(" → "),
      from: nodes[c.from].id, to: nodes[c.to].id, controls: refs,
      residual: edgeResidual(refs, false), residualAfter: edgeResidual(refs, true),
    };
  });
  const open = edges.filter((e) => e.residual === "open").length;
  const openAfter = edges.filter((e) => e.residualAfter === "open").length;
  const term = edges[edges.length - 1];
  const all = new Map<string, RTControlRef>();
  for (const e of edges) for (const r of e.controls) if (!all.has(r.key)) all.set(r.key, r);
  const controlsList = [...all.values()];
  return {
    id: `${meta.id}`, templateKey: meta.id, title: meta.title, category: meta.category, objective: meta.objective,
    applicability, impact: meta.impact, owasp: meta.owasp, atlas: meta.atlas,
    whyApplies: meta.whyApplies, attackerGets: meta.attackerGets,
    nodes, edges, controls: controlsList,
    residual: pathResidual(open, edges.length, term.residual),
    residualAfter: pathResidual(openAfter, edges.length, term.residualAfter),
    counts: {
      verified: controlsList.filter((c) => c.status === "verified").length,
      partial: controlsList.filter((c) => c.status === "partial").length,
      recommended: controlsList.filter((c) => c.status === "recommended").length,
      missing: controlsList.filter((c) => c.status === "missing").length,
    },
    recommendation: meta.recommendation,
  };
}

interface Ctx {
  uc: { id: string; name: string; tier: number | null };
  data: GraphNode[]; retrieval: GraphNode | null; model: GraphNode | null; agent: GraphNode | null;
  action: GraphNode | null; vendor: GraphNode | null; runtime: GraphNode | null; monitor: GraphNode | null;
  usesRag: boolean; sensitive: boolean; decisionSupport: boolean; hasAction: boolean; memory: boolean;
  st: (k: string) => ControlStatus;
}

type Template = (ctx: Ctx, controls: RTControl[]) => RedTeamPath | null;

const TEMPLATES: Template[] = [
  // 1 — Indirect prompt injection via RAG source
  (c, controls) => {
    if (!c.usesRag || !c.model) return null;
    const entry = c.data.find((d) => SENSITIVE.test(d.name)) ?? c.data[0] ?? ({ id: "src", name: "Knowledge source", stage: "data" } as GraphNode);
    const retr: RTNode = c.retrieval ? { id: c.retrieval.id, name: c.retrieval.name, role: "Retrieval index" } : { id: "retr:unmapped", name: "Retrieval index (unmapped)", role: "Retrieval index", placeholder: true };
    const out: RTNode = c.hasAction ? { id: c.action!.id, name: c.action!.name, role: "Action" } : { id: "decision", name: `${c.uc.name} decision`, role: "Decision" };
    const term: AttackEdgeType = c.hasAction ? "triggers_action" : "influences_decision";
    const applic: Applicability = c.sensitive && (c.hasAction || c.decisionSupport) && (c.st("retrieval_boundary") !== "verified" || c.st("source_trust") !== "verified") ? "strong" : c.sensitive || c.hasAction ? "moderate" : "weak";
    const nodes: RTNode[] = [{ id: entry.id, name: entry.name, role: "Untrusted source" }, retr, { id: c.model.id, name: c.model.name, role: "Model" }, out];
    return finalize({
      id: "rag_injection", title: "Indirect prompt injection via RAG source", category: "Prompt / Retrieval", objective: "Manipulate output",
      owasp: ["LLM01: Prompt Injection", "LLM05: Improper Output Handling"], atlas: ["AML.T0051: LLM Prompt Injection"], impact: c.model.scores.impact,
      whyApplies: `This use case retrieves over ${retr.placeholder ? "an unmapped retrieval index" : retr.name}${c.st("source_trust") === "verified" ? " with verified source-trust" : " with no verified source-trust control"}, and its output ${c.hasAction ? `can trigger "${out.name}"` : "feeds a decision"}. Untrusted content placed in a source can reach the model as instruction.`,
      attackerGets: ["Influence the model's output by planting instructions in retrieved content", c.sensitive ? "Reach sensitive data the retrieval layer can pull" : "", c.hasAction ? `Steer a downstream "${out.name}" action` : c.decisionSupport ? `Shape a Tier-${c.uc.tier} decision` : ""].filter(Boolean),
      recommendation: c.hasAction && c.st("human_approval") !== "verified" ? `Put a verified human-approval gate before "${out.name}", then verify retrieval source-trust and boundary.` : "Verify retrieval source-trust and output validation to close the upstream steps.",
    }, applic, nodes, [{ types: ["injects_into"], from: 0, to: 1 }, { types: ["poisons_context"], from: 1, to: 2 }, { types: ["manipulates_output", term], from: 2, to: 3 }], controls);
  },
  // 2 — RAG data exfiltration
  (c, controls) => {
    if (!c.usesRag || !c.sensitive || !c.model) return null;
    const src = c.data.find((d) => SENSITIVE.test(d.name)) ?? c.data[0] ?? ({ id: "src", name: "Sensitive source", stage: "data" } as GraphNode);
    const retr: RTNode = c.retrieval ? { id: c.retrieval.id, name: c.retrieval.name, role: "Retrieval index" } : { id: "retr:unmapped", name: "Retrieval index", role: "Retrieval index", placeholder: true };
    const applic: Applicability = c.st("retrieval_boundary") !== "verified" && c.st("identity_retrieval") !== "verified" ? "strong" : "moderate";
    const nodes: RTNode[] = [{ id: src.id, name: src.name, role: "Sensitive source" }, retr, { id: c.model.id, name: c.model.name, role: "Model" }, { id: "out:channel", name: "Output channel", role: "Output" }];
    return finalize({
      id: "rag_exfil", title: "Sensitive-data extraction via retrieval", category: "Data Exposure", objective: "Extract sensitive data",
      owasp: ["LLM02: Sensitive Information Disclosure", "LLM06: Excessive Agency"], atlas: ["AML.T0024: Exfiltration via ML Inference"], impact: "critical",
      whyApplies: `Retrieval can pull ${src.name}${c.st("identity_retrieval") === "verified" ? " under identity-aware scoping" : " without verified identity-aware scoping"}. A crafted prompt can make the model summarise or surface sensitive content beyond the asker's entitlement.`,
      attackerGets: [`Pull ${(c.uc.name.match(SENSITIVE)?.[0] ?? "sensitive").toLowerCase()} data via retrieval`, "Have the model summarise it into a readable answer", "Move it out through the AI's output channel"],
      recommendation: "Verify identity-aware retrieval and a DLP / output-redaction control before this is approved for production.",
    }, applic, nodes, [{ types: ["retrieves_sensitive_data"], from: 0, to: 1 }, { types: ["retrieves_sensitive_data"], from: 1, to: 2 }, { types: ["manipulates_output", "externalizes_data"], from: 2, to: 3 }], controls);
  },
  // 3 — Tool / action abuse
  (c, controls) => {
    if (!c.hasAction || !c.model) return null;
    const core = c.agent ?? c.model;
    const applic: Applicability = c.st("human_approval") !== "verified" ? "strong" : c.st("scoped_credentials") !== "verified" ? "moderate" : "weak";
    const nodes: RTNode[] = [{ id: "entry:prompt", name: "Manipulated prompt / context", role: "Entry" }, { id: core.id, name: core.name, role: "Agent / model" }, { id: c.action!.id, name: c.action!.name, role: "Action" }];
    return finalize({
      id: "tool_abuse", title: "Tool / action abuse", category: "Tool / Action", objective: "Trigger unauthorized action",
      owasp: ["LLM06: Excessive Agency", "LLM01: Prompt Injection"], atlas: ["AML.T0053: LLM Plugin Compromise"], impact: c.action!.scores.impact,
      whyApplies: `The agent can trigger "${c.action!.name}". ${c.st("human_approval") === "verified" ? "A verified human-approval gate stands in front of it" : "There is no verified human-approval gate"}, so a manipulated goal can drive the action${c.st("scoped_credentials") === "verified" ? " — though scoped credentials limit blast radius" : ""}.`,
      attackerGets: [`Drive the "${c.action!.name}" action`, "Use the AI's identity and credentials", "Reach the downstream system the action writes to"],
      recommendation: c.st("human_approval") !== "verified" ? `Require a verified human-approval gate before "${c.action!.name}", and scope its credentials.` : "Verify scoped credentials, rate limiting and a rollback path for this action.",
    }, applic, nodes, [{ types: ["injects_into"], from: 0, to: 1 }, { types: ["triggers_action", "abuses_identity"], from: 1, to: 2 }], controls);
  },
  // 4 — Vendor AI supply-chain abuse
  (c, controls) => {
    if (!c.vendor || !c.model) return null;
    const applic: Applicability = c.st("vendor_review") !== "verified" ? "strong" : "moderate";
    const nodes: RTNode[] = [{ id: c.vendor.id, name: c.vendor.name, role: "Vendor AI" }, { id: c.model.id, name: c.model.name, role: "Use case" }];
    return finalize({
      id: "vendor_supplychain", title: "Vendor AI supply-chain abuse", category: "Vendor / Supply Chain", objective: "Inherit uncontrolled AI risk",
      owasp: ["LLM03: Supply Chain", "LLM04: Data and Model Poisoning"], atlas: ["AML.T0010: ML Supply Chain Compromise"], impact: "high",
      whyApplies: `A vendor-controlled AI ("${c.vendor.name}") processes this use case's data. ${c.st("vendor_review") === "verified" ? "Vendor commitments are verified" : "No-training / retention / subprocessor commitments aren't verified"}, so the vendor can change the underlying model or data handling outside your control.`,
      attackerGets: ["Change AI behaviour through a vendor-controlled model", "Process your data under undisclosed terms or subprocessors", "Shift the control boundary without your review"],
      recommendation: "Verify the vendor review: no-training and retention clauses, subprocessor disclosure, and a model-change notification, with a 90-day re-attestation.",
    }, applic, nodes, [{ types: ["inherits_vendor_risk", "changes_behavior"], from: 0, to: 1 }], controls);
  },
  // 5 — Output manipulation in a decision workflow (decision-support, no action)
  (c, controls) => {
    if (c.hasAction || !c.decisionSupport || !c.model) return null;
    const applic: Applicability = c.st("output_validation") !== "verified" ? "strong" : "moderate";
    const nodes: RTNode[] = [{ id: c.model.id, name: c.model.name, role: "Model" }, { id: "decision", name: `${c.uc.name} decision`, role: "Decision" }];
    return finalize({
      id: "output_decision", title: "Output manipulation in a decision workflow", category: "Output / Decision", objective: "Influence a business decision",
      owasp: ["LLM05: Improper Output Handling", "LLM09: Misinformation"], atlas: ["AML.T0048: Erode ML Model Integrity"], impact: c.model.scores.impact,
      whyApplies: `This is Tier-${c.uc.tier} decision support and the output is used by a human decision-maker. ${c.st("output_validation") === "verified" ? "Output validation is verified" : "Output validation isn't verified"}, so a manipulated or unsafe recommendation can reach the decision unchecked.`,
      attackerGets: ["Produce a biased or unsafe recommendation", "Have a human rely on it", `Influence a Tier-${c.uc.tier} decision`],
      recommendation: "Verify output validation, required source citations, and a human-accountable review before the output feeds the decision.",
    }, applic, nodes, [{ types: ["manipulates_output", "influences_decision"], from: 0, to: 1 }], controls);
  },
  // 6 — Memory / state poisoning
  (c, controls) => {
    if (!c.memory || !c.model) return null;
    const applic: Applicability = c.st("memory_control") !== "verified" ? "strong" : "weak";
    const nodes: RTNode[] = [{ id: "entry:mem", name: "Malicious instruction", role: "Entry" }, { id: "memory", name: "Memory / persistent state", role: "Memory" }, { id: c.model.id, name: c.model.name, role: "Future output" }];
    return finalize({
      id: "memory_poisoning", title: "Memory / state poisoning", category: "Memory / State", objective: "Persist malicious influence",
      owasp: ["LLM01: Prompt Injection", "LLM04: Data and Model Poisoning"], atlas: ["AML.T0051: LLM Prompt Injection"], impact: c.model.scores.impact,
      whyApplies: `This use case keeps persistent memory or state, and ${c.st("memory_control") === "verified" ? "memory scope/review is verified" : "memory scope/review isn't verified"}. An injected instruction can persist and steer future sessions.`,
      attackerGets: ["Plant a persistent instruction or preference", "Influence outputs across future sessions", "Continue the compromise without re-injecting"],
      recommendation: "Verify memory scoping, expiry, user-visible memory and a reset path so injected state can't persist silently.",
    }, applic, nodes, [{ types: ["injects_into"], from: 0, to: 1 }, { types: ["persists_memory"], from: 1, to: 2 }], controls);
  },
  // 7 — Logging / evidence evasion
  (c, controls) => {
    if (!c.model) return null;
    if (c.st("logging") === "verified") return null; // detection already proven
    const applic: Applicability = c.monitor ? "moderate" : "strong";
    const nodes: RTNode[] = [{ id: c.model.id, name: c.model.name, role: "AI activity" }, { id: "evidence", name: c.monitor ? c.monitor.name : "Logging / evidence", role: "Evidence", placeholder: !c.monitor }];
    return finalize({
      id: "logging_evasion", title: "Logging / evidence evasion", category: "Monitoring / Evidence", objective: "Avoid detection",
      owasp: ["LLM05: Improper Output Handling", "LLM06: Excessive Agency"], atlas: ["AML.T0049: Exploit Public-Facing Application"], impact: "moderate",
      whyApplies: `Prompt/output/action logging ${c.monitor ? "exists but isn't verified" : "isn't mapped"}, so an attack through prompt, retrieval or tool paths may leave no reconstructable evidence — the control failure can't be proven or contained.`,
      attackerGets: ["Act without a reconstructable trail", "Delay or prevent detection", "Make the control failure unprovable"],
      recommendation: "Verify prompt/output and action logging with retention and (ideally) tamper-evident storage and SIEM alerting.",
    }, applic, nodes, [{ types: ["evades_logging"], from: 0, to: 1 }], controls);
  },
  // 8 — Infrastructure / runtime change abuse
  (c, controls) => {
    if (!c.runtime || !c.model) return null;
    const volatile = c.runtime.scores.volatility === "uncontrolled" || c.runtime.scores.volatility === "volatile";
    if (!volatile) return null;
    const applic: Applicability = c.st("change_control") !== "verified" ? "strong" : "moderate";
    const nodes: RTNode[] = [{ id: c.runtime.id, name: c.runtime.name, role: "Runtime / provider" }, { id: c.model.id, name: c.model.name, role: "AI behaviour" }];
    return finalize({
      id: "runtime_change", title: "Runtime / model change abuse", category: "Runtime / Change", objective: "Change behaviour without review",
      owasp: ["LLM03: Supply Chain", "LLM04: Data and Model Poisoning"], atlas: ["AML.T0010: ML Supply Chain Compromise"], impact: c.model.scores.impact,
      whyApplies: `The runtime/model is vendor-managed or high-volatility, and ${c.st("change_control") === "verified" ? "change control is verified" : "version pinning / change control isn't verified"}. A model, prompt, or runtime change can shift behaviour so the approved decision no longer reflects the live system.`,
      attackerGets: ["Change AI behaviour without a review", "Operate outside the reviewed authority boundary", "Invalidate a prior approval silently"],
      recommendation: "Verify version pinning or a model-change-notification, runtime digest verification, and a re-attestation trigger on change.",
    }, applic, nodes, [{ types: ["changes_behavior"], from: 0, to: 1 }], controls);
  },
];

const APPLIC_RANK: Record<Applicability, number> = { strong: 0, moderate: 1, weak: 2 };

export function buildRedTeam(uc: { id: string; name: string; tier: number | null; classify?: { patterns?: string[]; do?: string[] } | null }, graph: AuthorityGraph, controls: RTControl[]): RedTeamPath[] {
  const data = graph.nodes.filter((n) => n.stage === "data");
  const find = (s: string) => graph.nodes.find((n) => n.stage === s) ?? null;
  const patterns = (uc.classify?.patterns ?? []).join(" ");
  const action = find("action");
  const st = (k: string) => { const a = ARCHETYPES.find((x) => x.key === k); return a ? statusForArchetype(a, controls) : "missing"; };
  const ctx: Ctx = {
    uc: { id: uc.id, name: uc.name, tier: uc.tier ?? null },
    data, retrieval: find("retrieval"), model: find("model"), agent: find("agent"), action,
    vendor: find("vendor"), runtime: find("runtime"), monitor: find("monitor"),
    usesRag: Boolean(find("retrieval")) || /rag|retriev|grounding|knowledge base|embedding/i.test(patterns),
    sensitive: data.some((d) => SENSITIVE.test(d.name) || d.scores.impact === "critical" || d.scores.impact === "high") || SENSITIVE.test(uc.name),
    decisionSupport: (uc.tier ?? 0) >= 3, hasAction: Boolean(action),
    memory: /memory|persistent|long[- ]?term|remember|session state|stateful/i.test(patterns),
    st,
  };
  const paths = TEMPLATES.map((t) => t(ctx, controls)).filter((p): p is RedTeamPath => p !== null);
  paths.sort((a, b) => APPLIC_RANK[a.applicability] - APPLIC_RANK[b.applicability]);
  return paths;
}

export function fastestWins(path: RedTeamPath): { label: string; closes: number }[] {
  const out: { label: string; closes: number }[] = [];
  for (const a of ARCHETYPES) {
    const ref = path.controls.find((c) => c.key === a.key);
    if (!ref || ref.status === "verified") continue;
    const closes = path.edges.filter((e) => e.residual === "open" && e.controls.some((c) => c.key === a.key)).length;
    if (closes > 0) out.push({ label: `Verify ${a.label.toLowerCase()}`, closes });
  }
  return out.sort((x, y) => y.closes - x.closes).slice(0, 3);
}

/** Portfolio-style rollup over a use case's paths. */
export function redTeamSummary(paths: RedTeamPath[]) {
  return {
    total: paths.length,
    strong: paths.filter((p) => p.applicability === "strong").length,
    reachAction: paths.filter((p) => p.edges.some((e) => e.types.includes("triggers_action"))).length,
    reachSensitive: paths.filter((p) => p.edges.some((e) => e.types.includes("retrieves_sensitive_data"))).length,
    unmitigated: paths.filter((p) => p.residual.tone === "open").length,
    blocked: paths.filter((p) => p.residual.tone === "blocked").length,
  };
}
