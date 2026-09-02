/** Vendor AI Review — pre-purchase assessment of a third-party AI product.
 *  Lives outside the use-case flow. See agent-knowledge/15-VENDOR-AI-REVIEW.md. */

export const VR_STATUSES = [
  "intake",       // captured, not yet evaluated
  "evaluated",    // one-shot classify/tier + question pack generated
  "sent",         // vendor invited
  "in_review",    // answers coming in
  "reassessed",   // scored against vendor answers
  "decided",      // buying decision recorded
  "archived",
] as const;
export type VRStatus = (typeof VR_STATUSES)[number];

export const VR_SECTIONS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"] as const;
export type VRSection = (typeof VR_SECTIONS)[number];

export const VR_SECTION_LABELS: Record<VRSection, string> = {
  A: "Product & AI capability",
  B: "SEE — data access & exposure",
  C: "Training, retention & reuse",
  D: "DECIDE — recommendations",
  E: "DO — actions & automation",
  F: "Model, architecture & supply chain",
  G: "Security, abuse & red team",
  H: "Monitoring, logging & evidence",
  I: "Incident response & resilience",
  J: "Legal, privacy & contract",
};

/** Per-answer status (KB §13). Drives the decision rollup. */
export const VR_ANSWER_STATUSES = ["pending", "met", "partial", "gap", "unanswered", "evasive"] as const;
export type VRAnswerStatus = (typeof VR_ANSWER_STATUSES)[number];

export const VR_DECISIONS = ["approve", "conditions", "defer", "reject"] as const;
export type VRDecision = (typeof VR_DECISIONS)[number];

export const VR_DECISION_LABELS: Record<VRDecision, string> = {
  approve: "Approve",
  conditions: "Approve with conditions",
  defer: "Defer pending evidence",
  reject: "Reject / do not enable AI",
};

export type VRAnswerSource = "vendor" | "customer";

export const VR_PARTICIPANT_STATUSES = ["invited", "active", "submitted", "revoked"] as const;
export type VRParticipantStatus = (typeof VR_PARTICIPANT_STATUSES)[number];

export interface VendorReview {
  id: string;
  org_id: string;
  product_name: string;
  vendor_name: string | null;
  category: string | null;
  business_function: string | null;
  business_owner_name: string | null;
  business_owner_email: string | null;
  description: string | null;
  ai_features: string | null;
  planned_data_access: string | null;
  deployment: string | null;
  status: VRStatus;
  tier: number | null;
  classification: VRClassification | null;
  decision: VRDecision | null;
  decision_rationale: string | null;
  conditions: VRCondition[] | null;
  residual_risk: string | null;
  final_decision: VRDecision | null;
  final_rationale: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface VRClassification {
  pattern: string;
  see: string;
  decide: string;
  do: string;
  autonomy: string;
  summary: string;
  tier_rationale?: string;
  risk_profile?: { area: string; score: number }[];
}

export interface VRCondition {
  text: string;
  stage: "procurement" | "contract" | "pilot" | "production" | "expansion";
  owner?: string;
}

export interface VendorReviewItem {
  id: string;
  review_id: string;
  org_id: string;
  section: VRSection;
  q_ref: string | null;
  question: string;
  why_it_matters: string | null;
  required_evidence: string | null;
  acceptable_answer: string | null;
  concern_answer: string | null;
  suggested_condition: string | null;
  is_critical: boolean;
  vendor_answer: string | null;
  evidence_url: string | null;
  answer_source: VRAnswerSource | null;
  status: VRAnswerStatus;
  sort: number;
}

export interface VendorReviewParticipant {
  id: string;
  review_id: string;
  org_id: string;
  email: string;
  user_id: string | null;
  role: "vendor";
  invite_token: string;
  status: VRParticipantStatus;
  invited_by: string | null;
  invited_at: string;
  accepted_at: string | null;
  submitted_at: string | null;
}
