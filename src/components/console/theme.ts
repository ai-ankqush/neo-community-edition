/** Console design tokens - ported from ai-control-console.jsx (Layer 1). */

export const TIER_COLORS: Record<number, string> = {
  1: "#22c55e", 2: "#3b82f6", 3: "#f59e0b", 4: "#f97316", 5: "#ef4444",
};

export const TIER_NAMES: Record<number, string> = {
  1: "Low-Risk Productivity",
  2: "Internal Productivity",
  3: "Decision-Supporting AI",
  4: "Action-Capable AI",
  5: "Autonomous / Regulated",
};

/** Our decision enum -> display label + color */
export const REC_DISPLAY: Record<string, { label: string; color: string }> = {
  fast_track_approved: { label: "Fast-track approved", color: "#22c55e" },
  approved: { label: "Approved", color: "#22c55e" },
  approved_with_conditions: { label: "Approved with conditions", color: "#3b82f6" },
  pilot_only: { label: "Pilot only", color: "#f59e0b" },
  requires_remediation_before_approval: { label: "Requires remediation", color: "#f97316" },
  requires_enhanced_review: { label: "Requires enhanced review", color: "#ef4444" },
  requires_formal_risk_acceptance: { label: "Requires risk acceptance", color: "#ef4444" },
  not_approved: { label: "Not approved", color: "#ef4444" },
  suspended_pending_review: { label: "Suspended", color: "#ef4444" },
};

/** Control/evidence/test status -> color */
export const STATUS_COLORS: Record<string, string> = {
  in_place: "#22c55e", partial: "#f59e0b", gap: "#ef4444", "n/a": "#374151",
  provided: "#22c55e", requested: "#6b7280", expired: "#ef4444",
  passed: "#22c55e", failed: "#ef4444", in_progress: "#3b82f6", not_started: "#6b7280",
  open: "#f59e0b", closed: "#22c55e", lapsed: "#ef4444",
};

export const STATUS_LABELS: Record<string, string> = {
  in_place: "Ready", partial: "Partial", gap: "Not Ready", "n/a": "N/A",
  provided: "Provided", requested: "Requested", expired: "Expired",
  passed: "Passed", failed: "Failed", in_progress: "In Progress", not_started: "Not Started",
  open: "Open", closed: "Closed", lapsed: "Lapsed",
};

export const PILLAR_NAMES: Record<number, string> = {
  1: "Inventory", 2: "Identity & Access", 3: "Data Boundary", 4: "Input Control",
  5: "Output Control", 6: "Tool & Action", 7: "Accountability", 8: "Assurance",
  9: "Monitoring", 10: "Containment",
};
