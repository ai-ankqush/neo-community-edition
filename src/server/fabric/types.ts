/** Governed AI Integration Fabric — core types (read-first / Verification Fabric).
 *  See agent-knowledge/16-GOVERNED-AI-INTEGRATION-FABRIC.md. */

export type CheckOutcome = "pass" | "fail" | "partial" | "error";
export type Confidence = "high" | "medium" | "low";
export type PolicyDecision = "allow" | "deny" | "conditions";

/** What a check() returns — evidence-shaped, not just a boolean. This is what
 *  makes Neo a control-evidence system rather than a scanner. */
export interface CheckResult {
  result: CheckOutcome;
  normalizedEvidence?: unknown;       // normalized form Neo reasons on / stores
  rawArtifactRef?: string | null;     // pointer to the original (e.g. BOM file URL)
  confidence?: Confidence;
  validUntil?: string | null;         // ISO — freshness / expiry
  triggerForRecheck?: string | null;  // repo_change | config_drift | 24h | ...
  remediationHint?: string | null;
  policyDecision?: PolicyDecision;
  note?: string;
}

export interface OrgConnection {
  id: string;
  provider: string;
  label: string | null;
  status: string;
  credential: unknown;
}

export interface ConnectorContext {
  orgId: string;
  connection: OrgConnection;
}

/** Every vendor implements this one contract. The rest of Neo never imports a
 *  vendor SDK — it talks only to this abstraction. */
export interface Connector {
  provider: string;
  capabilities(): string[];
  check(capability: string, params: Record<string, unknown>, ctx: ConnectorContext): Promise<CheckResult>;
  // act(capability, params, ctx) — Enforcement Fabric ONLY. Not implemented read-first.
  // A connector must pass the read-only evidence path, policy binding, rate limits,
  // approval flow and rollback/containment design before act() is allowed.
}
