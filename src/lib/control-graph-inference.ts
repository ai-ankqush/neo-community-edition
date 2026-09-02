/** AI Control Graph — the inference engine (first cut).
 *
 *  Curated, named, cross-fact checks over the estate. Each emits a GRADED finding
 *  with the facts that triggered it and a recommendation — not a bare filter.
 *  Honest by design: every finding cites the evidence it stands on, and these are
 *  governance flags to act on, not automated verdicts. Pure + client-safe. */

import type { CGUseCase } from "./control-graph";

export type Severity = "high" | "medium" | "low";

/** Two lanes — operational findings are time-sensitive events a SOC can ingest
 *  and act on (an incident; a live system running unproven); governance findings
 *  are point-in-time posture gaps that belong to an owner with an SLA, not an
 *  alert queue. The lane drives how the finding is presented and routed. */
export type Lane = "operational" | "governance";

export interface CGFinding {
  rule: string;
  label: string;
  severity: Severity;
  lane: Lane;
  useCaseId: string;
  useCaseName: string;
  tier: number | null;
  why: string;
  recommendation: string;
  evidence: string[];
}

export interface CGRule {
  key: string;
  label: string;
  severity: Severity;
  lane: Lane;
  blurb: string;
  evaluate: (u: CGUseCase) => Omit<CGFinding, "rule" | "label" | "severity" | "lane" | "useCaseId" | "useCaseName" | "tier"> | null;
}

const controlsGap = (u: CGUseCase) => u.controlsImplemented < u.controlsRequired;
const unproven = (u: CGUseCase) => !u.hasEvidence || controlsGap(u);

const CODE_DEPLOY = /github|gitlab|bitbucket|deploy|pipeline|jenkins|terraform|kubernetes|\bk8s\b|argo|ci.?cd|cloudformation|ansible|prod(uction)? env/i;
const reachesCodeDeploy = (u: CGUseCase) => u.entityKeys.some((k) => CODE_DEPLOY.test(k)) || u.does.some((d) => CODE_DEPLOY.test(d));

export const CG_RULES: CGRule[] = [
  {
    key: "acts_unproven",
    label: "Can act, controls unproven",
    severity: "high",
    lane: "governance",
    blurb: "The AI can take real-world actions (write, send, externalize, delete, deploy) but its controls aren't fully in place or evidenced.",
    evaluate: (u) =>
      u.canAct && unproven(u)
        ? {
            why: "This AI can take real actions, but the controls that should govern those actions aren't fully implemented or proven.",
            recommendation: "Implement and verify the action-governing controls before relying on it to act — or constrain it to draft/advisory until then.",
            evidence: [
              `Can take real-world actions`,
              `${u.controlsImplemented}/${u.controlsRequired} controls in place`,
              u.hasEvidence ? "Some verified evidence" : "No verified evidence",
            ],
          }
        : null,
  },
  {
    key: "sensitive_unreviewed",
    label: "Sensitive data, no decision",
    severity: "high",
    lane: "governance",
    blurb: "Accesses sensitive or regulated data with no recorded governance decision.",
    evaluate: (u) =>
      u.sensitive && !u.decided
        ? {
            why: "It can reach sensitive or regulated data, but no governance decision has been recorded for it.",
            recommendation: "Take it to the review board and record a decision before it goes further.",
            evidence: ["Accesses sensitive / regulated data", "No decision recorded"],
          }
        : null,
  },
  {
    key: "high_risk_unproven",
    label: "High-risk, unproven controls",
    severity: "high",
    lane: "governance",
    blurb: "A Tier 4/5 use case running on controls that aren't fully implemented or evidenced.",
    evaluate: (u) =>
      (u.tier ?? 0) >= 4 && unproven(u)
        ? {
            why: `Tier ${u.tier} carries the highest due-diligence bar, but its controls aren't fully implemented or proven.`,
            recommendation: "Close the control gaps and verify evidence before production use.",
            evidence: [`Tier ${u.tier}`, `${u.controlsImplemented}/${u.controlsRequired} controls in place`, u.hasEvidence ? "Some verified evidence" : "No verified evidence"],
          }
        : null,
  },
  {
    key: "decision_domain",
    label: "High-stakes decision domain",
    severity: "medium",
    lane: "governance",
    blurb: "Touches a high-stakes domain (hiring, credit, pricing, access/security, health, legal) — extra scrutiny required.",
    evaluate: (u) =>
      u.domains.length > 0
        ? {
            why: `It can influence a high-stakes domain (${u.domains.join(", ")}), where automated AI decisions carry regulatory and fairness risk.`,
            recommendation: "Confirm human oversight and a recorded board decision for this domain; check for bias/fairness controls.",
            evidence: [`Domain: ${u.domains.join(", ")}`, u.decided ? "Decision recorded" : "No decision recorded"],
          }
        : null,
  },
  {
    key: "production_unproven",
    label: "Live, controls unproven",
    severity: "high",
    lane: "operational",
    blurb: "Marked as in production, but its controls aren't fully implemented or evidenced.",
    evaluate: (u) =>
      u.lifecycle === "production" && unproven(u)
        ? {
            why: "This AI is live in production, but its controls aren't fully implemented or proven — the gap is running against real users.",
            recommendation: "Treat as an open risk: close the control gaps and verify evidence, or record an accepted-risk exception with an owner and expiry.",
            evidence: ["Lifecycle: production", `${u.controlsImplemented}/${u.controlsRequired} controls in place`, u.hasEvidence ? "Some verified evidence" : "No verified evidence"],
          }
        : null,
  },
  {
    key: "code_deploy_escalate",
    label: "Reaches code / deploy",
    severity: "high",
    lane: "governance",
    blurb: "Can reach a code repo or deployment pipeline — a high-blast-radius surface that should be treated as Tier 4+.",
    evaluate: (u) =>
      reachesCodeDeploy(u)
        ? {
            why: "It can reach a code repository or deployment pipeline, so a failure or compromise can change what ships to production — the highest blast radius.",
            recommendation: `Treat this as Tier 4 or higher${(u.tier ?? 0) < 4 ? ` (currently Tier ${u.tier ?? "—"})` : ""}; require human approval on any write to code or deploy paths.`,
            evidence: ["Reaches code / deploy pipeline", u.tier ? `Tier ${u.tier}` : "Untiered"],
          }
        : null,
  },
  {
    key: "no_owner",
    label: "Accountability gap",
    severity: "medium",
    lane: "governance",
    blurb: "A high-impact use case with no named technical owner.",
    evaluate: (u) =>
      (u.canAct || (u.tier ?? 0) >= 4) && !u.technicalOwner
        ? {
            why: "This AI can act or is high-risk, but has no named technical owner — there's no clear accountability if it goes wrong.",
            recommendation: "Assign a technical owner on the use case so there's a clear DRI.",
            evidence: [u.canAct ? "Can take real-world actions" : `Tier ${u.tier}`, "No technical owner set"],
          }
        : null,
  },
  {
    key: "vendor_unassessed",
    label: "Unassessed vendor AI",
    severity: "high",
    lane: "governance",
    blurb: "Uses a third-party AI product that hasn't been through a vendor risk review.",
    evaluate: (u) => {
      const un = u.vendors.filter((v) => v.status === "unassessed");
      return un.length
        ? {
            why: `It relies on third-party AI (${un.map((v) => v.name).join(", ")}) with no vendor risk review on file — you don't know what it can do with your data.`,
            recommendation: "Run an AI Vendor Risk review on each before relying on it; demand the evidence and contract terms.",
            evidence: [`${un.length} unassessed vendor AI`, ...un.slice(0, 3).map((v) => v.name)],
          }
        : null;
    },
  },
  {
    key: "vendor_self_only",
    label: "Vendor self-attested only",
    severity: "medium",
    lane: "governance",
    blurb: "Relies on a vendor's self-attestation rather than an independent review.",
    evaluate: (u) => {
      const self = u.vendors.filter((v) => v.status === "self");
      return self.length
        ? {
            why: `Third-party AI here is covered only by the vendor's own self-attestation (${self.map((v) => v.name).join(", ")}), not an independent review.`,
            recommendation: "Escalate to a full vendor risk review for anything touching sensitive data or able to take actions.",
            evidence: [`${self.length} self-attested only`, ...self.slice(0, 3).map((v) => v.name)],
          }
        : null;
    },
  },
  {
    key: "open_incident",
    label: "Open incident",
    severity: "medium",
    lane: "operational",
    blurb: "Has an open or in-progress incident.",
    evaluate: (u) =>
      u.openIncidents > 0
        ? {
            why: `This AI has ${u.openIncidents} open incident${u.openIncidents === 1 ? "" : "s"}.`,
            recommendation: "Drive the incident to resolution and check whether its controls need tightening.",
            evidence: [`${u.openIncidents} open incident${u.openIncidents === 1 ? "" : "s"}`],
          }
        : null,
  },
];

/** Run every rule over the estate → graded findings, highest severity first. */
export function runInference(useCases: CGUseCase[]): CGFinding[] {
  const sev: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  const out: CGFinding[] = [];
  for (const r of CG_RULES) {
    for (const u of useCases) {
      const hit = r.evaluate(u);
      if (hit) out.push({ rule: r.key, label: r.label, severity: r.severity, lane: r.lane, useCaseId: u.id, useCaseName: u.name, tier: u.tier, ...hit });
    }
  }
  return out.sort((a, b) => sev[a.severity] - sev[b.severity]);
}
