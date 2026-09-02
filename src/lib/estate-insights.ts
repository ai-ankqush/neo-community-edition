/** Estate insights — the "What stands out" strip on the AI Control Graph map.
 *
 *  Findings are per-use-case ("this AI can act, controls unproven"). Insights are
 *  the opposite altitude: patterns ACROSS the estate that no single finding shows —
 *  concentration, shared blast radius, posture ratios, accountability gaps. Pure +
 *  derived from the same ControlGraph data; the map's own headline. */

import type { ControlGraph } from "./control-graph";

export type InsightIcon = "concentration" | "blast" | "posture" | "owner" | "decision";
export type InsightSeverity = "high" | "medium" | "low";

export type InsightAction =
  | { kind: "focus"; useCaseIds: string[]; label: string; focusLabel: string }
  | { kind: "lens"; lens: string; label: string }
  | { kind: "link"; href: string; label: string };

export interface EstateInsight {
  key: string;
  icon: InsightIcon;
  severity: InsightSeverity;
  text: string;
  action: InsightAction;
}

const sevRank: Record<InsightSeverity, number> = { high: 0, medium: 1, low: 2 };
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

/** Compute every candidate insight, then return the sharpest few (top by severity). */
export function buildEstateInsights(graph: ControlGraph, limit = 4): EstateInsight[] {
  const ucs = graph.useCases;
  const total = ucs.length;
  const out: EstateInsight[] = [];
  if (total === 0) return out;

  // 1. Model / provider concentration — the most-shared model across the estate.
  const models = graph.entities.filter((e) => e.kind === "model");
  const topModel = models[0]; // entities are pre-sorted by useCaseIds desc
  if (topModel && topModel.useCaseIds.length >= 2 && total >= 3) {
    const n = topModel.useCaseIds.length;
    const p = pct(n, total);
    out.push({
      key: "concentration",
      icon: "concentration",
      severity: p >= 50 ? "high" : p >= 33 ? "medium" : "low",
      text: `${n} of ${total} use cases run on ${topModel.name} — one outage or policy change hits ${p}% of your AI estate.`,
      action: { kind: "focus", useCaseIds: topModel.useCaseIds, label: "Show on map", focusLabel: `On ${topModel.name}` },
    });
  }

  // 2. Shared blast radius — the data/system entity reached by the most use cases.
  const shared = graph.entities.filter((e) => e.kind !== "model" && e.useCaseIds.length >= 2);
  const topShared = shared[0];
  if (topShared) {
    const n = topShared.useCaseIds.length;
    out.push({
      key: "blast",
      icon: "blast",
      severity: n >= 3 ? "high" : "medium",
      text: `${n} use cases all reach ${topShared.name} — a failure or injection in any one lands in the same place.`,
      action: { kind: "focus", useCaseIds: topShared.useCaseIds, label: "Show on map", focusLabel: `On ${topShared.name}` },
    });
  }

  // 3. Posture — high-tier AI running without proof.
  const tier45 = ucs.filter((u) => (u.tier ?? 0) >= 4);
  const unproven = tier45.filter((u) => u.controlsImplemented < u.controlsRequired || !u.hasEvidence);
  if (tier45.length >= 1 && unproven.length >= 1) {
    const p = pct(unproven.length, tier45.length);
    out.push({
      key: "posture",
      icon: "posture",
      severity: p >= 50 ? "high" : "medium",
      text: `${p}% of your Tier 4–5 AI is live without fully proven controls.`,
      action: { kind: "lens", lens: "missing_evidence", label: "Show on map" },
    });
  }

  // 4. Accountability — high-impact AI with no named technical owner.
  const highImpact = ucs.filter((u) => u.canAct || (u.tier ?? 0) >= 4);
  const noOwner = highImpact.filter((u) => !u.technicalOwner);
  if (highImpact.length >= 1 && noOwner.length >= 1) {
    const p = pct(noOwner.length, highImpact.length);
    out.push({
      key: "owner",
      icon: "owner",
      severity: p >= 50 ? "high" : "medium",
      text: `${p}% of your high-impact AI has no named technical owner.`,
      action: { kind: "focus", useCaseIds: noOwner.map((u) => u.id), label: "Show on map", focusLabel: "No technical owner" },
    });
  }

  // 5. Decision backlog — high-tier AI awaiting a recorded sign-off.
  const backlog = ucs.filter((u) => (u.tier ?? 0) >= 4 && !u.decided);
  if (backlog.length >= 1) {
    out.push({
      key: "decision",
      icon: "decision",
      severity: backlog.length >= 3 ? "high" : "medium",
      text: `${backlog.length} high-tier use case${backlog.length === 1 ? "" : "s"} ${backlog.length === 1 ? "is" : "are"} live or in progress with no recorded decision.`,
      action: { kind: "lens", lens: "high_no_decision", label: "Show on map" },
    });
  }

  return out.sort((a, b) => sevRank[a.severity] - sevRank[b.severity]).slice(0, limit);
}
