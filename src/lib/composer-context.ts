/** Composer context — turns what the assessment already captured (declared stack +
 *  generated controls) into a guided, context-driven Integration Composer flow.
 *
 *  The customer never types an API name from scratch. Instead Neo shows the techs
 *  THEY declared that Neo has no built-in connector for, and — for each — the
 *  control(s) in their own use cases that map to it. Selecting one tells Neo both
 *  the system AND what to verify, so the user only has to connect read-only.
 *
 *  Pure/derived — no DB calls here; the page passes use cases + controls in. */

import { TECH_CATALOG, ALL_TECH_NAMES, techForControl, type StackSelection } from "@/lib/tech-catalog";
import { INTEGRATIONS } from "@/lib/integrations-catalog";

/** Tech names (lowercased) that Neo already has a provider-managed connector for,
 *  so they must NOT be offered to the Composer. Maps the integrations catalog (whose
 *  ids/names use provider keys) onto the tech-catalog product names + common aliases. */
const PROVIDER_ALIASES: Record<string, string[]> = {
  github: ["github"],
  aws: ["aws", "aws bedrock", "amazon web services"],
  gcp: ["gcp", "google cloud", "gcp vertex ai"],
  azure: ["azure", "azure openai", "azure devops", "azure pipelines"],
  okta: ["okta"],
  entra: ["microsoft entra id", "entra id", "entra", "azure ad"],
  google_workspace: ["google workspace"],
  servicenow: ["servicenow", "servicenow grc"],
  jira: ["jira"],
  splunk: ["splunk"],
  openai: ["openai api", "openai"],
  anthropic: ["anthropic api", "anthropic"],
  langsmith: ["langsmith", "langchain", "langgraph"],
  vault: ["hashicorp vault", "vault"],
  snowflake: ["snowflake"],
  databricks: ["databricks", "databricks mosaic"],
  purview: ["microsoft purview", "purview"],
  datadog: ["datadog"],
};

export const PROVIDER_COVERED: Set<string> = (() => {
  const s = new Set<string>();
  for (const it of INTEGRATIONS) {
    s.add(it.name.toLowerCase());
    for (const a of PROVIDER_ALIASES[it.id] ?? []) s.add(a);
  }
  return s;
})();

export function isProviderCovered(tech: string | null | undefined): boolean {
  if (!tech) return false;
  return PROVIDER_COVERED.has(tech.toLowerCase());
}

/** Every catalog product as {name, category} — powers the "type your own" lookup,
 *  the same catalog the use-case stack picker uses. */
export const ALL_TECH: { name: string; category: string }[] = TECH_CATALOG.flatMap((c) =>
  c.products.map((p) => ({ name: p.name, category: c.label })),
);

const CATEGORY_OF: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const c of TECH_CATALOG) for (const p of c.products) m[p.name.toLowerCase()] = c.label;
  return m;
})();

export function techCategory(name: string): string {
  return CATEGORY_OF[name.toLowerCase()] ?? "Other / Internal tool";
}

export interface ComposerCandidateControl {
  id: string;
  control: string;
  ref: string;       // short identifier shown in the UI (framework ref or pillar code) — not the full text
  useCaseId: string;
  ucName: string;
}

const PILLAR_CODE = ["", "GV", "OB", "AN", "RS", "AD", "P6", "P7", "P8", "P9", "P10"];

/** A short, recognizable identifier for a control — prefer a framework crosswalk
 *  ref, else a pillar code. Keeps the Composer list clean ("just identifiers"). */
function controlRef(pillar: number | null | undefined, refs: Record<string, string> | null | undefined): string {
  if (refs) {
    for (const v of Object.values(refs)) {
      const s = (v ?? "").trim();
      if (s && s.toLowerCase() !== "n/a") return s.length > 22 ? s.slice(0, 22) + "…" : s;
    }
  }
  const p = typeof pillar === "number" ? pillar : 0;
  return PILLAR_CODE[p] ?? `P${p}`;
}

export interface ComposerCandidate {
  tech: string;          // canonical product name as declared/cataloged
  category: string;
  controls: ComposerCandidateControl[];  // controls in the org's use cases that map to this tech
  useCaseIds: string[];  // distinct use cases that declared or reference it
}

type UC = { id: string; name?: string | null; stack?: StackSelection | null };
type Control = { id: string; use_case_id: string; control: string; pillar?: number | null; framework_refs?: Record<string, string> | null };

/** Build the Composer's pick-list: the techs this org actually uses (declared in a
 *  stack OR named by a control) that Neo has no connector for — each with the controls
 *  that map to it. This is the context that makes the flow "select, don't type". */
export function buildComposerCandidates(useCases: UC[], controls: Control[]): ComposerCandidate[] {
  const stackByUc = new Map<string, StackSelection | null>(useCases.map((u) => [u.id, u.stack ?? null]));
  const nameByUc = new Map<string, string>(useCases.map((u) => [u.id, u.name ?? "Use case"]));
  // canonical display name keyed by lowercase
  const canon = new Map<string, string>();
  const byTech = new Map<string, ComposerCandidate>();

  const ensure = (tech: string): ComposerCandidate => {
    const key = tech.toLowerCase();
    if (!canon.has(key)) canon.set(key, tech);
    let c = byTech.get(key);
    if (!c) { c = { tech: canon.get(key)!, category: techCategory(tech), controls: [], useCaseIds: [] }; byTech.set(key, c); }
    return c;
  };

  // 1) controls → their lead configure-in tech (skip process controls / covered techs)
  for (const ci of controls) {
    if (typeof ci.control !== "string") continue;
    const techs = techForControl(ci.control, stackByUc.get(ci.use_case_id) ?? null);
    const lead = techs[0];
    if (!lead || isProviderCovered(lead)) continue;
    const cand = ensure(lead);
    cand.controls.push({ id: ci.id, control: ci.control, ref: controlRef(ci.pillar, ci.framework_refs), useCaseId: ci.use_case_id, ucName: nameByUc.get(ci.use_case_id) ?? "Use case" });
    if (!cand.useCaseIds.includes(ci.use_case_id)) cand.useCaseIds.push(ci.use_case_id);
  }

  // 2) declared products with no connector and not yet captured (Path C: "create one anyway")
  for (const u of useCases) {
    for (const p of u.stack?.products ?? []) {
      if (!p?.name || isProviderCovered(p.name)) continue;
      // only catalog/known products here — free "other" text shouldn't pollute the list
      const cand = ensure(p.name);
      if (!cand.useCaseIds.includes(u.id)) cand.useCaseIds.push(u.id);
    }
  }

  // sort: ones with mapped controls first (highest value), then alphabetically
  return [...byTech.values()].sort((a, b) => (b.controls.length - a.controls.length) || a.tech.localeCompare(b.tech));
}

export { ALL_TECH_NAMES };
