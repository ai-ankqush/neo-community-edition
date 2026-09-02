import "server-only";
import { z } from "zod";

/** Structured output schemas per stage. The engine enforces these. */

export const ClassifyOutput = z.object({
  patterns: z.array(z.string()).min(1),
  see: z.array(z.string()),
  decide: z.array(z.string()),
  do: z.array(z.string()),
  autonomyLevel: z.number().int().min(0).max(5),
  rationale: z.string(),
  openQuestions: z.array(z.string()),
});
export type ClassifyOutput = z.infer<typeof ClassifyOutput>;

export const RISK_AREAS = [
  "Data Boundary", "Decision Influence", "Tool/Action",
  "Human Accountability", "Evidence", "Containment", "Vendor/Supply Chain",
  "Regulatory", "External Exposure", "Recoverability",
] as const;

export const TierOutput = z.object({
  tier: z.number().int().min(1).max(5),
  rationale: z.string(),
  punchline: z.string(),
  reallyIs: z.string(),
  topRisk: z.string(),
  overlookedRisk: z.string(),
  failureMode: z.string(),
  evidenceGap: z.string(),
  riskDrivers: z
    .array(
      z.object({
        area: z.enum(RISK_AREAS),
        rating: z.enum(["Low", "Medium", "High", "Critical"]),
        reason: z.string(),
      })
    )
    .min(5)
    .max(10),
  escalationTriggers: z.array(
    z.object({
      id: z.string(),
      trigger: z.string(),
      newTier: z.union([z.number().int().min(2).max(5), z.string()]),
    })
  ),
  informationNeeded: z.array(z.string()),
});
export type TierOutput = z.infer<typeof TierOutput>;

export const QuestionsOutput = z.object({
  questions: z
    .array(
      z.object({
        block: z.enum(["use_case", "see", "decide", "do", "accountability", "stack", "standards"]),
        question: z.string(),
        why: z.string(),
        blocking: z.boolean(),
      })
    )
    .min(3)
    .max(20),
});
export type QuestionsOutput = z.infer<typeof QuestionsOutput>;

export const ControlsOutput = z.object({
  controls: z
    .array(
      z.object({
        pillar: z.number().int().min(1).max(10),
        control: z.string(),
        why: z.string(),
        requirement: z.enum(["required", "recommended", "n/a"]),
        evidence: z.string(),
        assuranceTest: z.string(),
        stackImplementation: z.string(),
        frameworks: z.object({
          nist_ai_rmf: z.string(),
          iso_42001: z.string(),
          eu_ai_act: z.string(),
          owasp_llm: z.string(),
          sr_11_7: z.string().optional().default(""),
          nydfs_500: z.string().optional().default(""),
        }),
      })
    )
    .min(5),
});
export type ControlsOutput = z.infer<typeof ControlsOutput>;

// Relaxed variant for the per-pillar-group fan-out: each parallel call returns
// the controls for a subset of pillars (so it can't meet the min(5) total).
// The merged result is validated against the full ControlsOutput.
export const ControlsPartialOutput = z.object({
  controls: z.array(ControlsOutput.shape.controls.element).min(1),
});
export type ControlsPartialOutput = z.infer<typeof ControlsPartialOutput>;

export const EvidenceOutput = z.object({
  evidenceRequests: z
    .array(
      z.object({
        category: z.enum([
          "governance_ownership", "data_boundary", "vendor_ai", "decision_output",
          "tool_action", "accountability", "assurance_testing", "monitoring_logging",
          "containment_recovery",
        ]),
        item: z.string(),
        why: z.string(),
        howToProduce: z.string(),
        blocking: z.boolean(),
      })
    )
    .min(5)
    .max(30),
});
export type EvidenceOutput = z.infer<typeof EvidenceOutput>;

export const AssuranceOutput = z.object({
  tests: z
    .array(
      z.object({
        category: z.string(),
        objective: z.string(),
        method: z.string(),
        expected: z.string(),
        evidenceProduced: z.string(),
        suggestedOwner: z.string(),
      })
    )
    .min(3)
    .max(15),
});
export type AssuranceOutput = z.infer<typeof AssuranceOutput>;

export const DecisionOutput = z.object({
  recommendation: z.enum([
    "fast_track_approved", "approved", "approved_with_conditions", "pilot_only",
    "requires_remediation_before_approval", "requires_enhanced_review",
    "requires_formal_risk_acceptance", "not_approved", "suspended_pending_review",
  ]),
  executiveRationale: z.string(),
  conditions: z
    .array(
      z.object({
        condition: z.string(),
        suggestedOwner: z.string(),
        due: z.string(),
        consequence: z.string(),
      })
    )
    .max(10),
  approversRequired: z.array(z.string()),
  reassessmentTriggers: z.array(z.string()),
});
export type DecisionOutput = z.infer<typeof DecisionOutput>;

/** JSON Schema versions for the Anthropic tool definition. */
export const CLASSIFY_TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    patterns: { type: "array", items: { type: "string" }, description: "AI patterns from the methodology list" },
    see: { type: "array", items: { type: "string" }, description: "What the AI can access" },
    decide: { type: "array", items: { type: "string" }, description: "What the AI influences" },
    do: { type: "array", items: { type: "string" }, description: "What the AI can trigger or change" },
    autonomyLevel: { type: "integer", minimum: 0, maximum: 5 },
    rationale: { type: "string" },
    openQuestions: { type: "array", items: { type: "string" } },
  },
  required: ["patterns", "see", "decide", "do", "autonomyLevel", "rationale", "openQuestions"],
};

export const QUESTIONS_TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    questions: {
      type: "array",
      minItems: 3,
      maxItems: 20,
      items: {
        type: "object",
        properties: {
          block: {
            type: "string",
            enum: ["use_case", "see", "decide", "do", "accountability", "stack", "standards"],
          },
          question: { type: "string" },
          why: { type: "string", description: "The control decision this answer informs" },
          blocking: { type: "boolean", description: "True if control selection cannot proceed without this answer" },
        },
        required: ["block", "question", "why", "blocking"],
      },
    },
  },
  required: ["questions"],
};

export const CONTROLS_TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    controls: {
      type: "array",
      minItems: 5,
      items: {
        type: "object",
        properties: {
          pillar: { type: "integer", minimum: 1, maximum: 10 },
          control: { type: "string", description: "Specific control statement for this use case" },
          why: { type: "string", description: "The risk driver this control addresses" },
          requirement: { type: "string", enum: ["required", "recommended", "n/a"] },
          evidence: { type: "string", description: "Configuration-level proof the control exists" },
          assuranceTest: { type: "string", description: "Test that validates the control works" },
          stackImplementation: { type: "string", description: "Concrete implementation using the client's declared stack" },
          frameworks: {
            type: "object",
            description: "Framework crosswalk references for this control",
            properties: {
              nist_ai_rmf: { type: "string", description: "NIST AI RMF function/category refs, e.g. 'GOVERN 1.2; MAP 3.4'" },
              iso_42001: { type: "string", description: "ISO/IEC 42001 clause refs, e.g. 'A.6.2.4'" },
              eu_ai_act: { type: "string", description: "EU AI Act article refs, e.g. 'Art. 9; Art. 14'" },
              owasp_llm: { type: "string", description: "OWASP LLM/Agentic refs, e.g. 'LLM01; LLM08'" },
              sr_11_7: { type: "string", description: "SR 11-7 model risk element this control supports: 'Development, implementation & use', 'Validation & effective challenge', or 'Governance & controls'. Blank if not applicable." },
              nydfs_500: { type: "string", description: "NYDFS 23 NYCRR Part 500 section refs (AI-through-cyber), e.g. '500.13 asset inventory; 500.9 risk assessment'. Blank if not applicable." },
            },
            required: ["nist_ai_rmf", "iso_42001", "eu_ai_act", "owasp_llm"],
          },
        },
        required: ["pillar", "control", "why", "requirement", "evidence", "assuranceTest", "stackImplementation", "frameworks"],
      },
    },
  },
  required: ["controls"],
};

// Same item shape, minItems 1 — used by the per-pillar-group controls fan-out.
export const CONTROLS_PARTIAL_TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    controls: {
      type: "array",
      minItems: 1,
      items: (CONTROLS_TOOL_SCHEMA.properties.controls as { items: unknown }).items,
    },
  },
  required: ["controls"],
};

export const EVIDENCE_TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    evidenceRequests: {
      type: "array",
      minItems: 5,
      maxItems: 30,
      items: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: [
              "governance_ownership", "data_boundary", "vendor_ai", "decision_output",
              "tool_action", "accountability", "assurance_testing", "monitoring_logging",
              "containment_recovery",
            ],
          },
          item: { type: "string", description: "The specific evidence requested" },
          why: { type: "string", description: "Which risk this evidences" },
          howToProduce: { type: "string", description: "The export/screenshot/query that satisfies it, in the client's stack" },
          blocking: { type: "boolean" },
        },
        required: ["category", "item", "why", "howToProduce", "blocking"],
      },
    },
  },
  required: ["evidenceRequests"],
};

export const ASSURANCE_TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    tests: {
      type: "array",
      minItems: 3,
      maxItems: 15,
      items: {
        type: "object",
        properties: {
          category: { type: "string" },
          objective: { type: "string" },
          method: { type: "string", description: "Step-by-step, executable in the client's stack" },
          expected: { type: "string", description: "Unambiguous pass criterion" },
          evidenceProduced: { type: "string" },
          suggestedOwner: { type: "string" },
        },
        required: ["category", "objective", "method", "expected", "evidenceProduced", "suggestedOwner"],
      },
    },
  },
  required: ["tests"],
};

export const DECISION_TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    recommendation: {
      type: "string",
      enum: [
        "fast_track_approved", "approved", "approved_with_conditions", "pilot_only",
        "requires_remediation_before_approval", "requires_enhanced_review",
        "requires_formal_risk_acceptance", "not_approved", "suspended_pending_review",
      ],
    },
    executiveRationale: { type: "string", description: "3-6 sentences a CISO can read to a governance committee" },
    conditions: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        properties: {
          condition: { type: "string" },
          suggestedOwner: { type: "string" },
          due: { type: "string" },
          consequence: { type: "string" },
        },
        required: ["condition", "suggestedOwner", "due", "consequence"],
      },
    },
    approversRequired: { type: "array", items: { type: "string" } },
    reassessmentTriggers: { type: "array", items: { type: "string" } },
  },
  required: ["recommendation", "executiveRationale", "conditions", "approversRequired", "reassessmentTriggers"],
};

export const TIER_TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    tier: { type: "integer", minimum: 1, maximum: 5 },
    rationale: { type: "string" },
    punchline: { type: "string", description: "One sharp italicizable sentence capturing the control story of this use case" },
    reallyIs: { type: "string", description: "What this use case really is, stripped of marketing language - one sentence" },
    topRisk: { type: "string", description: "The most important risk - one sentence" },
    overlookedRisk: { type: "string", description: "The risk most teams would miss - one sentence" },
    failureMode: { type: "string", description: "The most likely way this fails in practice - one sentence" },
    evidenceGap: { type: "string", description: "The most important evidence gap to anticipate - one sentence" },
    riskDrivers: {
      type: "array",
      minItems: 5,
      maxItems: 10,
      items: {
        type: "object",
        properties: {
          area: {
            type: "string",
            enum: ["Data Boundary", "Decision Influence", "Tool/Action", "Human Accountability", "Evidence", "Containment", "Vendor/Supply Chain", "Regulatory", "External Exposure", "Recoverability"],
          },
          rating: { type: "string", enum: ["Low", "Medium", "High", "Critical"] },
          reason: { type: "string", description: "Short reason - a few words" },
        },
        required: ["area", "rating", "reason"],
      },
    },
    escalationTriggers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          trigger: { type: "string" },
          newTier: { type: ["integer", "string"] },
        },
        required: ["id", "trigger", "newTier"],
      },
    },
    informationNeeded: { type: "array", items: { type: "string" } },
  },
  required: ["tier", "rationale", "riskDrivers", "escalationTriggers", "informationNeeded"],
};

// ---- Implementation Pack v2: per-control engineering artifacts ----
export const ArtifactsOutput = z.object({
  artifacts: z
    .array(
      z.object({
        ref: z.string(),
        artifactType: z.enum(["terraform", "policy", "config", "detection", "runbook"]),
        language: z.string(),
        filename: z.string(),
        content: z.string(),
      })
    )
    .min(1),
});
export type ArtifactsOutput = z.infer<typeof ArtifactsOutput>;

// ---- Red Team: attack paths per use case (Enterprise) ----
export const RedTeamOutput = z.object({
  attacks: z
    .array(
      z.object({
        vector: z.enum(["see", "decide", "do"]),
        technique: z.string(),
        scenario: z.string(),
        unguardedOutcome: z.string(),
        severity: z.enum(["critical", "high", "medium", "low"]),
        owaspRef: z.string().optional().default(""),
        atlasRef: z.string().optional().default(""),
        blockingPillar: z.number().int().min(1).max(10),
        blockingControl: z.string(),
      })
    )
    .min(1),
});
export type RedTeamOutput = z.infer<typeof RedTeamOutput>;

export const RED_TEAM_TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    attacks: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        properties: {
          vector: { type: "string", enum: ["see", "decide", "do"] },
          technique: { type: "string", description: "Short attack name" },
          scenario: { type: "string", description: "Concrete, use-case-specific narration of the attack" },
          unguardedOutcome: { type: "string", description: "What happens if nothing stops it" },
          severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
          owaspRef: { type: "string", description: "OWASP LLM id(s), e.g. 'LLM01'" },
          atlasRef: { type: "string", description: "MITRE ATLAS technique id(s) where applicable" },
          blockingPillar: { type: "integer", minimum: 1, maximum: 10, description: "The pillar whose control defeats this attack" },
          blockingControl: { type: "string", description: "The specific control statement that blocks it; match an existing selected control where possible" },
        },
        required: ["vector", "technique", "scenario", "unguardedOutcome", "severity", "blockingPillar", "blockingControl"],
      },
    },
  },
  required: ["attacks"],
};

export const ARTIFACTS_TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    artifacts: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        properties: {
          ref: { type: "string", description: "The control's ref, echoed back exactly" },
          artifactType: { type: "string", enum: ["terraform", "policy", "config", "detection", "runbook"] },
          language: { type: "string", description: "hcl | rego | json | bash | kql | spl | eql | markdown" },
          filename: { type: "string", description: "filename with the correct extension" },
          content: { type: "string", description: "the artifact body — a review-before-apply scaffold with TODO markers" },
        },
        required: ["ref", "artifactType", "language", "filename", "content"],
      },
    },
  },
  required: ["artifacts"],
};
