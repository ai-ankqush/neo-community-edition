/** AI Dependency Authority Graph — per-use-case derivation (Phase 1).
 *
 *  Reframes the supply chain from a ledger into an AUTHORITY SURFACE: a left-to-right
 *  flow (Data → Retrieval → Model/Agent → Action → Monitor) with typed edges and four
 *  orthogonal scores per node — Impact, Influence, Confidence, Volatility. Everything is
 *  derived from what the assessment already captured (declared stack + See/Decide/Do
 *  classification + patterns + connected providers + vendor reviews). No new data, no
 *  migration — the graph is built fresh each render, exactly like the ledger. */

export type Stage = "data" | "retrieval" | "model" | "agent" | "action" | "monitor" | "vendor" | "control" | "compute" | "runtime";
export type Influence = "informational" | "context-shaping" | "output-shaping" | "decision-shaping" | "action-shaping";
export type Volatility = "stable" | "managed" | "volatile" | "uncontrolled";
export type Impact = "low" | "moderate" | "high" | "critical";
export type Trust = "unknown" | "declared" | "evidenced" | "verified";
export type EvidenceState = "missing" | "partial" | "stale" | "current" | "verified";
export type EdgeType = "reads" | "embeds" | "calls" | "writes" | "logs" | "controls" | "inherits" | "changes-via" | "approves" | "runs-on";

export interface GraphNode {
  id: string;
  name: string;
  stage: Stage;
  typeLabel: string;
  authority: string[];           // SEE · DECIDE · DO · EXPOSE
  trust: Trust;
  evidence: EvidenceState;
  scores: { impact: Impact; influence: Influence; confidence: number; volatility: Volatility };
  connectorId: string | null;    // a Neo connector that could verify it
  governingControl: string;
  risk: { severity: "high" | "medium" | "low"; note: string }[];
}

export interface GraphEdge { from: string; to: string; type: EdgeType; critical?: boolean }

export interface HiddenDep { severity: "high" | "medium"; text: string }

export interface AuthorityGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  hidden: HiddenDep[];
  summary: string[];             // plain-English authority-path conclusions
  confidence: number;            // 0–100, weighted by influence
}

export interface UCInput {
  id: string;
  name: string;
  tier: number | null;
  stack: { products?: { category: string; name: string; services?: string[] }[] } | null | undefined;
  classify: { see?: string[]; decide?: string[]; do?: string[]; patterns?: string[]; autonomyLevel?: number } | null | undefined;
}

export interface VendorSignal {
  name: string; vendor?: string | null; decision?: string | null;
  tier?: number | null; dataAccess?: string | null;
  classify?: { see?: string[]; decide?: string[]; do?: string[] } | null;
  selfAttested?: boolean;          // customer attested themselves (no vendor review) → "declared" tier
}
export interface GraphSignals {
  connectedProviders?: string[];                                   // flips trust → verified
  vendors?: VendorSignal[];                                        // org vendors; filtered to those relevant to this use case
}

const VENDOR_DOMAINS = ["hr", "employee", "payroll", "health", "medical", "patient", "customer", "financial", "finance", "legal", "support", "marketing", "sales", "code", "security", "identity"];

/** Org vendor reviews aren't linked to a use case in the data model, so we attach a
 *  vendor to this use case only when there's real overlap — its product appears in the
 *  stack, or it shares a sensitive data domain (HR, customer, finance…) with the use
 *  case. This keeps the per-use-case graph honest instead of dumping every org vendor on
 *  every use case. */
export function relevantVendors(uc: UCInput, vendors: VendorSignal[]): VendorSignal[] {
  const products = namedProducts(uc).map((p) => p.name.toLowerCase());
  const ucText = `${uc.name ?? ""} ${asStrArr(uc.classify?.see).join(" ")} ${asStrArr(uc.classify?.do).join(" ")}`.toLowerCase();
  return (vendors ?? []).filter((v) => {
    if (!v || typeof v.name !== "string" || !v.name.trim()) return false;
    const lname = v.name.toLowerCase();
    const vname = `${lname} ${(v.vendor ?? "").toLowerCase()}`.trim();
    if (products.some((pn) => pn.length > 2 && (vname.includes(pn) || lname.includes(pn)))) return true;
    const vtext = `${vname} ${(v.dataAccess ?? "").toLowerCase()} ${asStrArr(v.classify?.see).join(" ").toLowerCase()}`;
    return VENDOR_DOMAINS.some((d) => ucText.includes(d) && vtext.includes(d));
  });
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const HOSTED = /gpt|openai|o1|o3|o4|claude|anthropic|gemini|vertex|titan|bedrock|azure openai|cohere|mistral-?api/i;
const RETRIEVAL = /search|vector|pinecone|weaviate|kendra|chroma|qdrant|milvus|ai search|elastic/i;
const SIEM = /splunk|sentinel|datadog|chronicle|qradar|sumo|elastic security/i;
const SENSITIVE = /hr|employee|payroll|health|medical|patient|pii|personal|customer|financial|finance|salary|ssn|confidential|legal|case/i;
const RETRIEVAL_PATTERN = /rag|retriev|grounding|knowledge base|embedding/i;
const AGENTIC_PATTERN = /agent|tool|orchestrat|workflow|action/i;
const NEOCLOUD = /coreweave|lambda labs|lambda gpu|lambda cloud|crusoe|nebius|nscale|together ai|fireworks|runpod|vast\.?ai|paperspace|modal/i;
const RUNTIME_RE = /kubernetes|k8s|eks|gke|aks|openshift|docker|container|ecs|fargate|cloud run|serverless|lambda function|nomad|\bray\b|sagemaker endpoint|vertex endpoint/i;

const CONNECTOR: { id: string; terms: RegExp }[] = [
  { id: "openai", terms: /gpt|openai|text-embedding/i }, { id: "anthropic", terms: /claude|anthropic/i },
  { id: "langsmith", terms: /langchain|langgraph|langsmith/i }, { id: "aws", terms: /aws|bedrock|s3|cloudtrail/i },
  { id: "gcp", terms: /gcp|google cloud|vertex|bigquery/i }, { id: "azure", terms: /azure/i },
  { id: "okta", terms: /okta/i }, { id: "entra", terms: /entra|azure ad/i }, { id: "splunk", terms: /splunk/i },
  { id: "servicenow", terms: /servicenow/i }, { id: "jira", terms: /jira/i }, { id: "snowflake", terms: /snowflake/i },
  { id: "databricks", terms: /databricks|unity catalog/i }, { id: "datadog", terms: /datadog/i },
  { id: "github", terms: /github/i }, { id: "vault", terms: /vault/i }, { id: "purview", terms: /purview/i },
];
const connectorFor = (name: string): string | null => CONNECTOR.find((c) => c.terms.test(name))?.id ?? null;

// DB rows aren't guaranteed clean (jsonb can be a string, a field can be the wrong
// type, a product can lack a name). Coerce defensively so no shape can crash the graph.
const asStrArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const asNum = (v: unknown): number | null => (typeof v === "number" ? v : v != null && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : null);
const namedProducts = (uc: UCInput): { category: string; name: string; services?: string[] }[] => {
  const raw = uc.stack?.products;
  return (Array.isArray(raw) ? raw : []).filter((p): p is { category: string; name: string; services?: string[] } => Boolean(p && typeof p.name === "string" && p.name.trim()));
};

export interface ComputeSpec { name: string; type: string; external: boolean; volatility: Volatility; connectorId: string | null; }

/** Where this use case's AI runs — the hosting PROVIDER, derived from the declared stack.
 *  Shared by the authority graph (one node) and the org-level concentration view (group by
 *  provider across use cases). The verifying connector is set explicitly so "Azure OpenAI"
 *  resolves to the Azure connector, not the openai one. */
export function deriveCompute(uc: UCInput): ComputeSpec | null {
  const products = namedProducts(uc);
  const modelProducts = products.filter((p) => p.category === "ai_platform");
  const m = modelProducts[0]?.name ?? "";
  const cloudProduct = products.find((p) => p.category === "cloud");
  const neocloudProduct = products.find((p) => NEOCLOUD.test(p.name));
  if (neocloudProduct) return { name: neocloudProduct.name, type: "neocloud_gpu", external: true, volatility: "uncontrolled", connectorId: null };
  if (cloudProduct) return { name: cloudProduct.name, type: "hyperscaler", external: true, volatility: "managed", connectorId: connectorFor(cloudProduct.name) };
  if (/bedrock/i.test(m)) return { name: "AWS", type: "managed_model_api", external: true, volatility: "managed", connectorId: "aws" };
  if (/vertex|gemini/i.test(m)) return { name: "Google Cloud", type: "managed_model_api", external: true, volatility: "managed", connectorId: "gcp" };
  if (/azure openai/i.test(m)) return { name: "Microsoft Azure", type: "managed_model_api", external: true, volatility: "managed", connectorId: "azure" };
  if (/gpt|openai/i.test(m)) return { name: "OpenAI (hosted)", type: "managed_model_api", external: true, volatility: "managed", connectorId: "openai" };
  if (/claude|anthropic/i.test(m)) return { name: "Anthropic (hosted)", type: "managed_model_api", external: true, volatility: "managed", connectorId: "anthropic" };
  if (modelProducts.length) return { name: "Self-hosted / private GPU", type: "self_hosted", external: false, volatility: "stable", connectorId: null };
  return null;
}

const INFLUENCE: Record<Stage, Influence> = {
  data: "context-shaping", retrieval: "output-shaping", model: "decision-shaping", agent: "action-shaping",
  action: "action-shaping", monitor: "informational", vendor: "output-shaping", control: "informational",
  compute: "informational", runtime: "informational",
};
const INFLUENCE_WEIGHT: Record<Influence, number> = {
  informational: 0.4, "context-shaping": 0.7, "output-shaping": 1, "decision-shaping": 1.3, "action-shaping": 1.3,
};
const GOVERNING: Record<Stage, string> = {
  data: "Data boundary & retrieval governance · Pillar 3",
  retrieval: "Retrieval scope & embedding boundary · Pillar 3",
  model: "AI component provenance & version pinning · Pillar 1",
  agent: "Tool & action authority · Pillar 6",
  action: "Tool & action control · Pillar 6",
  monitor: "Monitoring & evidence · Pillar 9",
  vendor: "Third-party AI assurance · Pillar 10",
  control: "Identity & access boundary · Pillar 2",
  compute: "AI compute & hosting assurance · Pillar 7",
  runtime: "Runtime & execution control · Pillar 7",
};
const CONF_OF: Record<Trust, number> = { unknown: 20, declared: 45, evidenced: 78, verified: 92 };

function impactOf(tier: number | null, sensitive: boolean, writes: boolean): Impact {
  let s = (tier ?? 2) - 1; // 0..4
  if (sensitive) s += 1;
  if (writes) s += 1;
  return s >= 4 ? "critical" : s >= 3 ? "high" : s >= 2 ? "moderate" : "low";
}

export function buildAuthorityGraph(uc: UCInput, signals: GraphSignals = {}): AuthorityGraph {
  const products = namedProducts(uc);
  const see = asStrArr(uc.classify?.see);
  const dos = asStrArr(uc.classify?.do);
  const patterns = asStrArr(uc.classify?.patterns).join(" ");
  const tierNum = asNum(uc.tier);
  const connected = new Set(signals.connectedProviders ?? []);
  const sensitiveUc = SENSITIVE.test(uc.name ?? "");

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();

  const add = (n: Omit<GraphNode, "scores"> & { sensitive?: boolean; writes?: boolean; scores?: { volatility?: Volatility } }): GraphNode => {
    if (seen.has(n.id)) return nodes.find((x) => x.id === n.id)!;
    const connId = n.connectorId ?? connectorFor(n.name);
    const trust: Trust = connected.has(connId ?? "") ? "verified" : n.trust;
    const evidence: EvidenceState =
      trust === "verified" ? "verified" : connId ? "partial" : trust === "evidenced" ? "current" : "missing";
    const node: GraphNode = {
      ...n,
      connectorId: connId,
      trust,
      evidence,
      scores: {
        impact: impactOf(tierNum, Boolean(n.sensitive), Boolean(n.writes)),
        influence: INFLUENCE[n.stage],
        confidence: CONF_OF[trust],
        volatility: n.scores?.volatility ?? "stable",
      },
    } as GraphNode;
    nodes.push(node);
    seen.add(n.id);
    return node;
  };

  // ── nodes ──────────────────────────────────────────────────────────────────
  const dataProducts = products.filter((p) => (p.category === "data" || /sharepoint|confluence|workday|salesforce|snowflake|crm|hris/i.test(p.name)) && !RETRIEVAL.test(p.name));
  const dataNames = [...new Set([...dataProducts.map((p) => p.name), ...see.slice(0, 3)])].slice(0, 4);
  const dataNodes = dataNames.map((name) =>
    add({ id: `data:${slug(name)}`, name, stage: "data", typeLabel: "Data source", authority: ["SEE"], trust: "declared", evidence: "missing", connectorId: null, governingControl: GOVERNING.data, risk: [], sensitive: SENSITIVE.test(name) || sensitiveUc, scores: { volatility: "stable" } as never }),
  );

  const retrievalProduct = products.find((p) => RETRIEVAL.test(p.name));
  const retrievalNode = retrievalProduct
    ? add({ id: `retr:${slug(retrievalProduct.name)}`, name: retrievalProduct.name, stage: "retrieval", typeLabel: "Retrieval index", authority: ["SEE"], trust: "declared", evidence: "missing", connectorId: null, governingControl: GOVERNING.retrieval, risk: [{ severity: "high", note: "Retrieval access controls not verified" }], sensitive: dataNodes.some((d) => d.scores.impact === "high" || d.scores.impact === "critical"), scores: { volatility: "managed" } as never })
    : null;

  const modelProducts = products.filter((p) => p.category === "ai_platform");
  const modelNodes = modelProducts.map((p) => {
    const hosted = HOSTED.test(p.name);
    return add({ id: `model:${slug(p.name)}`, name: p.name, stage: "model", typeLabel: "Model / reasoning", authority: ["DECIDE"], trust: hosted ? "declared" : "unknown", evidence: "missing", connectorId: null, governingControl: GOVERNING.model, risk: hosted ? [] : [{ severity: "high", note: "Open-weight / unverified publisher — provenance unknown" }], scores: { volatility: hosted ? "managed" : "stable" } as never });
  });
  // Every AI use case has a model by definition. If the tech stack didn't name one
  // (no ai_platform product captured), synthesise a generic model node so the graph
  // isn't missing its decision layer — and so downstream derivations that key off the
  // model node (Red Team paths, Control Picture, blast radius) still have a foothold.
  if (modelNodes.length === 0) {
    modelNodes.push(add({ id: "model:unspecified", name: "AI model (unspecified)", stage: "model", typeLabel: "Model / reasoning", authority: ["DECIDE"], trust: "unknown", evidence: "missing", connectorId: null, governingControl: GOVERNING.model, risk: [{ severity: "medium", note: "Model / provider not captured in the tech stack — provenance unverified. Add it in Manage → Technology." }], scores: { volatility: "stable" } as never }));
  }

  const agentProducts = products.filter((p) => p.category === "agent_framework");
  const agentNodes = agentProducts.map((p) =>
    add({ id: `agent:${slug(p.name)}`, name: p.name, stage: "agent", typeLabel: "Agent / orchestration", authority: ["DO"], trust: "declared", evidence: "missing", connectorId: null, governingControl: GOVERNING.agent, risk: [], scores: { volatility: "managed" } as never }),
  );

  const actionNames = dos.slice(0, 3);
  const actionNodes = actionNames.map((name) =>
    add({ id: `act:${slug(name)}`, name, stage: "action", typeLabel: "Action / tool", authority: ["DO"], trust: "declared", evidence: "missing", connectorId: null, governingControl: GOVERNING.action, risk: [{ severity: "high", note: "Action path — confirm human approval is enforced, not just declared" }], writes: true, sensitive: sensitiveUc, scores: { volatility: "stable" } as never }),
  );

  const siemProduct = products.find((p) => p.category === "siem" || SIEM.test(p.name));
  const monitorNode = siemProduct
    ? add({ id: `mon:${slug(siemProduct.name)}`, name: siemProduct.name, stage: "monitor", typeLabel: "Monitoring / evidence", authority: [], trust: "declared", evidence: "missing", connectorId: null, governingControl: GOVERNING.monitor, risk: [], scores: { volatility: "stable" } as never })
    : null;

  const vendorNodes = relevantVendors(uc, signals.vendors ?? []).slice(0, 3).map((v) => {
    const dec = (v.decision ?? "").toLowerCase();
    // Assurance ladder for a third-party AI: unknown (not assessed) → declared (self-attested /
    // approved-with-conditions) → evidenced (vendor-reviewed · approved — its strongest practical
    // tier; a third party can't reach our connector-"verified" bar). A reject/defer stays low AND
    // flags danger: a vendor you wouldn't buy is still embedded.
    const vtrust: Trust =
      dec === "approve" ? "evidenced"
      : dec === "conditions" ? "declared"
      : dec === "reject" || dec === "defer" ? "unknown"
      : v.selfAttested ? "declared"
      : "unknown";
    const label =
      dec === "approve" ? "Vendor AI · reviewed"
      : dec === "conditions" ? "Vendor AI · conditions"
      : dec === "reject" || dec === "defer" ? `Vendor AI · ${dec}`
      : v.selfAttested ? "Vendor AI · self-attested"
      : "Vendor AI · not assessed";
    const tierNote = (v.tier ?? 0) >= 3 ? [{ severity: "high" as const, note: `High-risk vendor AI (tier ${v.tier}) embedded in this use case` }] : [];
    const assuranceNote =
      dec === "reject" || dec === "defer" ? [{ severity: "high" as const, note: `Vendor review verdict: ${dec} — but the product is still embedded in this use case` }]
      : dec === "approve" ? [{ severity: "low" as const, note: "Vendor-reviewed · approved (disclosed by the vendor, not independently verified)" }]
      : dec === "conditions" ? [{ severity: "medium" as const, note: "Vendor-reviewed · approved with conditions to track" }]
      : v.selfAttested ? [{ severity: "medium" as const, note: "Self-attested — your assertion, not a vendor review" }]
      : [{ severity: "high" as const, note: "Not assessed — no vendor review on a third-party AI you don't control" }];
    return add({ id: `vendor:${slug(v.name)}`, name: v.name, stage: "vendor", typeLabel: label, authority: ["EXPOSE"], trust: vtrust, evidence: "missing", connectorId: null, governingControl: GOVERNING.vendor, risk: [...tierNote, ...assuranceNote], sensitive: sensitiveUc, scores: { volatility: "uncontrolled" } as never });
  });

  // ── compute + runtime (infrastructure layer) ────────────────────────────────
  // Derived from the stack: where the AI runs (compute provider) and what executes it
  // (runtime/container). Most of the value is the provider + whether it's external and
  // verified; the persisted org-level provider model comes later.
  const firstModelName = modelProducts[0]?.name ?? "";
  const computeSpec = deriveCompute(uc);

  const computeNode = computeSpec
    ? add({ id: `compute:${slug(computeSpec.name)}`, name: computeSpec.name, stage: "compute", typeLabel: "Compute / hosting", authority: [], trust: "declared", evidence: "missing", connectorId: computeSpec.connectorId, governingControl: GOVERNING.compute, risk: computeSpec.external ? [{ severity: "medium", note: "External compute provider — confirm tenant isolation, data residency, and retention" }] : [], sensitive: sensitiveUc, scores: { volatility: computeSpec.volatility } as never })
    : null;

  const runtimeProduct = products.find((p) => p.category === "iac_cicd" || RUNTIME_RE.test(p.name));
  const hostedModel = HOSTED.test(firstModelName);
  let runtimeNode: GraphNode | null = null;
  if (runtimeProduct) runtimeNode = add({ id: `rt:${slug(runtimeProduct.name)}`, name: runtimeProduct.name, stage: "runtime", typeLabel: "Runtime / execution", authority: [], trust: "declared", evidence: "missing", connectorId: null, governingControl: GOVERNING.runtime, risk: [{ severity: "medium", note: "Confirm the image digest is pinned and runtime change-control is in place" }], sensitive: sensitiveUc, scores: { volatility: "managed" } as never });
  else if (hostedModel) runtimeNode = add({ id: "rt:vendor-managed", name: "Vendor-managed runtime", stage: "runtime", typeLabel: "Runtime / execution", authority: [], trust: "declared", evidence: "missing", connectorId: null, governingControl: GOVERNING.runtime, risk: [{ severity: "high", note: "The vendor controls the runtime — it can change without notice unless a change-notification is required" }], sensitive: sensitiveUc, scores: { volatility: "uncontrolled" } as never });

  // ── edges (typed) ──────────────────────────────────────────────────────────
  const firstModel = modelNodes[0] ?? null;
  // sensitive data node drives the critical path
  const critData = dataNodes.find((d) => d.scores.impact === "critical" || d.scores.impact === "high") ?? dataNodes[0] ?? null;

  for (const d of dataNodes) {
    if (retrievalNode) edges.push({ from: d.id, to: retrievalNode.id, type: "embeds", critical: d.id === critData?.id });
    else if (firstModel) edges.push({ from: d.id, to: firstModel.id, type: "reads", critical: d.id === critData?.id });
  }
  if (retrievalNode && firstModel) edges.push({ from: retrievalNode.id, to: firstModel.id, type: "reads", critical: Boolean(critData) });
  for (const a of agentNodes) if (firstModel) edges.push({ from: a.id, to: firstModel.id, type: "calls" });
  for (const a of actionNodes) if (firstModel) edges.push({ from: firstModel.id, to: a.id, type: "writes", critical: true });
  if (monitorNode) {
    if (firstModel) edges.push({ from: firstModel.id, to: monitorNode.id, type: "logs" });
    for (const a of actionNodes) edges.push({ from: a.id, to: monitorNode.id, type: "logs" });
  }
  for (const v of vendorNodes) if (firstModel) edges.push({ from: v.id, to: firstModel.id, type: "changes-via" });
  // substrate: model runs on the runtime, which runs on the compute provider
  if (runtimeNode && firstModel) edges.push({ from: firstModel.id, to: runtimeNode.id, type: "runs-on" });
  if (computeNode) {
    const base = runtimeNode ?? firstModel;
    if (base) edges.push({ from: base.id, to: computeNode.id, type: "runs-on" });
  }

  // ── hidden-dependency detection ──────────────────────────────────────────────
  const hidden: HiddenDep[] = [];
  if (RETRIEVAL_PATTERN.test(patterns) && !retrievalNode) hidden.push({ severity: "high", text: "RAG / retrieval is in scope, but no vector index or embedding model is listed." });
  if ((AGENTIC_PATTERN.test(patterns) || (uc.classify?.autonomyLevel ?? 0) >= 3) && actionNodes.length === 0 && dos.length === 0) hidden.push({ severity: "high", text: "An agentic / tool-using workflow is described, but no tool or action dependency is mapped." });
  if (vendorNodes.length > 0 && modelNodes.every((m) => m.id === "model:unspecified")) hidden.push({ severity: "medium", text: "A vendor AI dependency is present, but no underlying model provider or subprocessor is attached." });
  if ((tierNum ?? 0) >= 4 && actionNodes.length > 0) hidden.push({ severity: "high", text: "Tier 4 decision-support with action paths, but no human-approval dependency is mapped." });
  if ((tierNum ?? 0) >= 3 && computeNode && computeSpec?.external && computeNode.trust !== "verified") hidden.push({ severity: "high", text: `Production AI runs on external compute (${computeNode.name}), but its tenant isolation, residency, and retention aren't verified.` });
  if (runtimeNode && runtimeNode.scores.volatility === "uncontrolled") hidden.push({ severity: "medium", text: "A vendor-managed runtime/model can change with no notice — no version pin or change-notification is mapped." });

  // ── plain-English authority-path summary ─────────────────────────────────────
  const outputShaping = nodes.filter((n) => n.scores.influence === "output-shaping" || n.scores.influence === "decision-shaping").length;
  const exposeData = dataNodes.filter((d) => d.scores.impact === "high" || d.scores.impact === "critical").length;
  const canAct = actionNodes.length;
  const unverified = nodes.filter((n) => n.trust !== "verified").length;
  const silent = nodes.filter((n) => n.scores.volatility === "uncontrolled" || n.scores.volatility === "volatile").length;
  const summary: string[] = [
    `${nodes.length} dependencies across model, data, retrieval, action${computeNode ? ", compute" : ""}${runtimeNode ? ", runtime" : ""}${monitorNode ? ", monitoring" : ""}${vendorNodes.length ? ", vendor" : ""}.`,
    `${outputShaping} can shape the AI's outputs or decisions.`,
    exposeData ? `${exposeData} expose sensitive data.` : "No sensitive-data exposure detected.",
    canAct ? `${canAct} can trigger downstream actions.` : "No action paths.",
    `${unverified} are not yet verified.`,
    silent ? `${silent} can change silently without a control review.` : "No silent-change risk detected.",
  ];

  // confidence weighted by influence (a high-influence unknown hurts more)
  let wSum = 0, wScore = 0;
  for (const n of nodes) { const w = INFLUENCE_WEIGHT[n.scores.influence]; wSum += w; wScore += w * n.scores.confidence; }
  const confidence = nodes.length ? Math.round(wScore / wSum) : 0;

  return { nodes, edges, hidden, summary, confidence };
}
