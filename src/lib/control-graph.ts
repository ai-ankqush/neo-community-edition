/** AI Control Graph — the estate/governance relationship model.
 *
 *  The whole-estate map: every AI use case as a hub, connected to the things it
 *  touches (data, models/AI services, systems) and carrying its governance state
 *  (tier, controls, evidence, decision). Derived from what the assessment already
 *  captured — no new data. Pure + client-safe; the per-AI technical x-ray is the
 *  Dependency Map (one level down), reached from a use-case node. */

export type EntityKind = "data" | "model" | "system";

export interface CGUseCase {
  id: string;
  name: string;
  tier: number | null;
  stage: string | null;
  lifecycle: string | null;       // proposed | pilot | production | retired
  technicalOwner: string | null;
  sponsor: string | null;
  sees: string[];                 // what the AI can access (classify.see)
  does: string[];                 // what the AI can do (classify.do)
  sensitive: boolean;             // accesses sensitive / regulated data
  controlsRequired: number;
  controlsImplemented: number;
  hasEvidence: boolean;           // at least one control verified
  decided: boolean;               // a decision was recorded
  openExceptions: number;
  openIncidents: number;
  canAct: boolean;                // "do" includes a real-world / high-impact action
  domains: string[];             // high-stakes decision domains it touches
  vendors: VendorRef[];          // third-party AI in the stack + its review status
  entityKeys: string[];           // connected entity node keys
}

export type VendorStatus = "reviewed" | "self" | "unassessed";
export interface VendorRef { name: string; status: VendorStatus }

export interface CGEntity {
  key: string;
  name: string;
  kind: EntityKind;
  useCaseIds: string[];           // who depends on it (concentration)
}

export interface CGSummary {
  total: number;
  byTier: { tier: number; count: number }[];
  sensitive: number;              // use cases accessing sensitive data
  missingEvidence: number;        // implemented controls but no evidence, or gaps
  awaitingDecision: number;       // no decision recorded
  highRiskNoDecision: number;     // Tier 4/5 with no decision (the headline gap)
  openIncidents: number;          // use cases with an open incident
  activeExceptions: number;       // use cases with an open accepted-risk exception
  unassessedVendors: number;      // use cases with a declared but un-reviewed third-party AI
}

export interface ControlGraph {
  useCases: CGUseCase[];
  entities: CGEntity[];
  summary: CGSummary;
}

const SENSITIVE = /\bpii\b|personal|customer data|health|\bphi\b|financial|payment|\bssn\b|regulated|confidential|salary|credential|biometric|medical/i;

/** Is any "see" item sensitive / regulated data. */
export function seesSensitive(sees: string[]): boolean {
  return sees.some((s) => SENSITIVE.test(s));
}

const HIGH_IMPACT = /\bwrite|create|update|delete|remove|send|email|external|share|publish|trigger|execute|deploy|provision|grant|revoke|transfer|\bpay\b|order|post\b|modif/i;
/** Does any "do" item describe a real-world / high-impact action (vs draft/notify only). */
export function actsHighImpact(does: string[]): boolean {
  return does.some((d) => HIGH_IMPACT.test(d));
}

const DOMAINS: { key: string; re: RegExp }[] = [
  { key: "hiring", re: /hir|recruit|candidate|applicant|resume|cv\b/i },
  { key: "credit/lending", re: /credit|loan|lend|underwrit|mortgage/i },
  { key: "pricing", re: /pricing|\bprice|discount|quote/i },
  { key: "access/security", re: /access|entitlement|permission|provision|privilege|security|fraud/i },
  { key: "health/medical", re: /medical|health|diagnos|patient|clinical/i },
  { key: "legal/benefits", re: /legal|benefit|insurance|claim|eligibilit/i },
];
/** High-stakes decision domains implied by what the AI sees or does. */
export function decisionDomains(texts: string[]): string[] {
  const joined = texts.join(" ");
  return DOMAINS.filter((d) => d.re.test(joined)).map((d) => d.key);
}

/** Categorise a stack product into a graph entity kind. */
export function entityKind(category: string, name: string): EntityKind {
  const s = `${category} ${name}`.toLowerCase();
  if (/\bdata|store|warehouse|lake|\bdb\b|sql|vector|index|knowledge|crm|sharepoint|drive|bucket|s3|bigquery|snowflake/.test(s)) return "data";
  if (/\bai\b|model|\bllm\b|gpt|claude|bedrock|agent|embedding|openai|anthropic|vertex|gemini|cohere|mistral|copilot/.test(s)) return "model";
  return "system";
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export interface CGInputUseCase {
  id: string; name: string; tier: number | null; stage: string | null;
  lifecycle: string | null; technicalOwner: string | null; sponsor: string | null;
  sees: string[]; does: string[];
  products: { category: string; name: string }[];
  controlsRequired: number; controlsImplemented: number; hasEvidence: boolean;
  decided: boolean; openExceptions: number; openIncidents: number;
  vendors: VendorRef[];
}

/** Build the estate graph from shaped per-use-case inputs. */
export function buildControlGraph(rows: CGInputUseCase[]): ControlGraph {
  const entityMap = new Map<string, CGEntity>();
  const useCases: CGUseCase[] = rows.map((r) => {
    const entityKeys: string[] = [];
    for (const p of r.products) {
      const name = (p.name ?? "").trim();
      if (!name) continue;
      const kind = entityKind(p.category ?? "", name);
      const key = `${kind}:${slug(name)}`;
      let e = entityMap.get(key);
      if (!e) { e = { key, name, kind, useCaseIds: [] }; entityMap.set(key, e); }
      if (!e.useCaseIds.includes(r.id)) e.useCaseIds.push(r.id);
      if (!entityKeys.includes(key)) entityKeys.push(key);
    }
    return {
      id: r.id, name: r.name, tier: r.tier, stage: r.stage,
      lifecycle: r.lifecycle, technicalOwner: r.technicalOwner, sponsor: r.sponsor,
      sees: r.sees, does: r.does,
      sensitive: seesSensitive(r.sees),
      controlsRequired: r.controlsRequired, controlsImplemented: r.controlsImplemented,
      hasEvidence: r.hasEvidence, decided: r.decided,
      openExceptions: r.openExceptions, openIncidents: r.openIncidents,
      canAct: actsHighImpact(r.does), domains: decisionDomains([...r.sees, ...r.does]),
      vendors: r.vendors,
      entityKeys,
    };
  });

  const tierCounts = new Map<number, number>();
  let sensitive = 0, missingEvidence = 0, awaitingDecision = 0, highRiskNoDecision = 0, openIncidents = 0, activeExceptions = 0, unassessedVendors = 0;
  for (const u of useCases) {
    if (u.tier != null) tierCounts.set(u.tier, (tierCounts.get(u.tier) ?? 0) + 1);
    if (u.sensitive) sensitive++;
    if (u.controlsImplemented > 0 && !u.hasEvidence) missingEvidence++;
    if (!u.decided) awaitingDecision++;
    if ((u.tier ?? 0) >= 4 && !u.decided) highRiskNoDecision++;
    if (u.openIncidents > 0) openIncidents++;
    if (u.openExceptions > 0) activeExceptions++;
    if (u.vendors.some((v) => v.status === "unassessed")) unassessedVendors++;
  }

  return {
    useCases,
    entities: [...entityMap.values()].sort((a, b) => b.useCaseIds.length - a.useCaseIds.length),
    summary: {
      total: useCases.length,
      byTier: [...tierCounts.entries()].map(([tier, count]) => ({ tier, count })).sort((a, b) => a.tier - b.tier),
      sensitive, missingEvidence, awaitingDecision, highRiskNoDecision, openIncidents, activeExceptions, unassessedVendors,
    },
  };
}

/** The estate "lenses" — the governance questions, as graph filters. Each returns
 *  whether a use case matches (the seed of the inference engine, shown honestly
 *  as filters, not verdicts). */
export const CG_LENSES: { key: string; label: string; match: (u: CGUseCase) => boolean }[] = [
  { key: "sensitive", label: "Accesses sensitive data", match: (u) => u.sensitive },
  { key: "missing_evidence", label: "Missing evidence", match: (u) => u.controlsImplemented > 0 && !u.hasEvidence },
  { key: "high_no_decision", label: "Tier 4/5, no decision", match: (u) => (u.tier ?? 0) >= 4 && !u.decided },
  { key: "gaps", label: "Control gaps", match: (u) => u.controlsImplemented < u.controlsRequired },
  { key: "incidents", label: "Open incidents", match: (u) => u.openIncidents > 0 },
  { key: "exceptions", label: "Active exceptions", match: (u) => u.openExceptions > 0 },
  { key: "vendor_unassessed", label: "Unassessed vendor AI", match: (u) => u.vendors.some((v) => v.status === "unassessed") },
];
