/**
 * The staged assessment workflow - the product's core state machine.
 * Encodes the Neo 18-step methodology as 9 product stages with human gates.
 * See: layer3-saas-product-spec.md section 3.
 */

export const STAGES = [
  "intake",      // 0 - guided use case capture
  "classify",    // 1 - pattern + see/decide/do + autonomy
  "tier",        // 2 - risk tier + escalation triggers (scope lock)
  "questions",   // 3 - tailored follow-up questions
  "controls",    // 4 - control selection across 10 pillars, stack-mapped
  "evidence",    // 5 - evidence request list + collection
  "assurance",   // 6 - test plan + results
  "decision",    // 7 - approval recommendation + conditions + sign-off
  "operate",     // 8 - roadmap live, tripwires armed, drift monitoring
] as const;

export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  intake: "Intake",
  classify: "Classification",
  tier: "Risk Tier",
  questions: "Context",
  controls: "Controls",
  evidence: "Evidence",
  assurance: "Assurance",
  decision: "Decision",
  operate: "Operate",
};

/** Stages whose gate may only be confirmed by these roles. */
export const STAGE_GATE_ROLES: Record<Stage, Role[]> = {
  intake: ["org_admin", "assessor"],
  classify: ["org_admin", "assessor"],
  tier: ["org_admin", "assessor"],
  questions: ["org_admin", "assessor"],
  controls: ["org_admin", "assessor"],
  evidence: ["org_admin", "assessor"],
  assurance: ["org_admin", "assessor"],
  decision: ["org_admin"], // approval requires admin (or named approver, later)
  operate: ["org_admin", "assessor"],
};

export type Role = "org_admin" | "assessor" | "contributor" | "viewer";

export function nextStage(s: Stage): Stage | null {
  const i = STAGES.indexOf(s);
  return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1] : null;
}

export function canAdvance(role: Role, stage: Stage): boolean {
  return STAGE_GATE_ROLES[stage].includes(role);
}
