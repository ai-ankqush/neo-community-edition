/**
 * Role lens — "Neo knows what matters to YOU." A user tells Neo their role once; from then on
 * Neo weights what it surfaces toward what that role actually cares about. It's a lens, not a
 * permission (RBAC is separate) and it's PRIVATE to the user (stored in personal memory).
 *
 * The philosophy: this is a conscience, not an assistant — it tells you what's important for
 * your role and nudges you to it; it never does the work or the judgement for you.
 */

export interface RoleDef { key: string; label: string; blurb: string }

export const ROLES: RoleDef[] = [
  { key: "ciso", label: "CISO", blurb: "Posture, high-tier exposure, board-ready risk" },
  { key: "security_architect", label: "Security Architect", blurb: "Control graph, supply chain, attack paths" },
  { key: "security_engineer", label: "Security Engineer", blurb: "Integrations, live verification, red team" },
  { key: "grc", label: "GRC / Compliance", blurb: "Controls coverage, evidence, frameworks" },
  { key: "ai_governance", label: "AI Governance Committee", blurb: "Tiering, decisions, framework coverage" },
  { key: "cio", label: "CIO / IT Leader", blurb: "Portfolio, decisions, reporting" },
  { key: "board", label: "Board / Executive", blurb: "Executive summary, decisions, top risks" },
];

export const ROLE_BY_KEY: Record<string, RoleDef> = Object.fromEntries(ROLES.map((r) => [r.key, r]));

/** Nudge kinds the desk can raise. */
export type DeskKind = "resume" | "redteam" | "controls" | "integration" | "redteam_none";

/**
 * Per-role priority multipliers by nudge kind (default 1.0). Tuned so each role sees ITS
 * concerns first without hiding anything — this only re-ranks, never filters out (surface-
 * don't-bury). Higher = pulled up for that role.
 */
export const ROLE_LENS: Record<string, Partial<Record<DeskKind, number>>> = {
  ciso:               { redteam: 1.6, controls: 1.3, resume: 1.1, integration: 0.9, redteam_none: 1.2 },
  security_architect: { redteam: 1.4, redteam_none: 1.5, integration: 1.4, controls: 1.2, resume: 1.0 },
  security_engineer:  { integration: 1.8, redteam_none: 1.6, redteam: 1.3, controls: 1.1, resume: 0.9 },
  grc:                { controls: 1.7, resume: 1.3, redteam: 1.1, integration: 0.8, redteam_none: 0.9 },
  ai_governance:      { resume: 1.4, controls: 1.4, redteam_none: 1.3, redteam: 1.2, integration: 0.8 },
  cio:                { resume: 1.3, controls: 1.2, redteam: 1.2, integration: 0.9, redteam_none: 1.0 },
  board:              { redteam: 1.6, resume: 1.3, controls: 1.1, integration: 0.6, redteam_none: 0.8 },
};

export function lensFor(role: string | null): Partial<Record<DeskKind, number>> {
  return (role && ROLE_LENS[role]) || {};
}
