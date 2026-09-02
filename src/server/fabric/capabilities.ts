/** Capability registry — controls reference CAPABILITIES, not vendors. A capability
 *  is satisfied by any connector that advertises it. The capability→check mapping
 *  is the IP. See agent-knowledge/16. */

export type CapabilityMaturity = 1 | 2 | 3 | 4 | 5;
// 1 read-only check · 2 +normalized evidence · 3 continuous re-verification
// 4 human-approved action · 5 runtime mediation / enforcement

export interface CapabilityDef {
  id: string;
  label: string;
  description: string;
  providers: string[];               // which connectors can satisfy it
  defaultValidityHours: number | null; // freshness default; null = no auto-expiry
  recheckTrigger: string;            // what should invalidate the evidence
  maturity: CapabilityMaturity;
}

export const CAPABILITIES: Record<string, CapabilityDef> = {
  ai_bom_present_and_valid: {
    id: "ai_bom_present_and_valid",
    label: "AI-BOM present & valid",
    description:
      "A valid CycloneDX ML-BOM exists in the artifact repository, declaring model lineage, dataset licenses, and dependencies for externally sourced / open-weight models.",
    providers: ["github"],
    defaultValidityHours: 720,        // ~monthly; or sooner on repo change
    recheckTrigger: "repo_change",
    maturity: 2,
  },
  mfa_enforced: {
    id: "mfa_enforced",
    label: "MFA enforced",
    description: "Multi-factor authentication is enforced for the identities around the AI use case.",
    providers: ["okta", "entra", "google_workspace"],
    defaultValidityHours: 168,
    recheckTrigger: "weekly",
    maturity: 2,
  },
  cloud_audit_logging_enabled: {
    id: "cloud_audit_logging_enabled",
    label: "Cloud audit logging enabled",
    description: "Audit/activity logging is enabled in the cloud account hosting the AI workload.",
    providers: ["aws", "gcp", "azure"],
    defaultValidityHours: 24,
    recheckTrigger: "config_drift",
    maturity: 2,
  },
  change_management_linked: {
    id: "change_management_linked",
    label: "Change management linked",
    description: "AI changes are governed through a change-management system of record.",
    providers: ["servicenow", "jira"],
    defaultValidityHours: 168,
    recheckTrigger: "weekly",
    maturity: 2,
  },
  siem_log_ingestion: {
    id: "siem_log_ingestion",
    label: "SIEM log ingestion",
    description: "The SIEM is actively ingesting logs from AI workloads — evidence for monitoring (Pillar 9).",
    providers: ["splunk"],
    defaultValidityHours: 24,
    recheckTrigger: "config_drift",
    maturity: 2,
  },

  // ── Roadmap capabilities (authored, gated until live-validated) ──────────
  ai_platform_inventory: {
    id: "ai_platform_inventory",
    label: "AI platform inventoried",
    description: "The AI model platform behind the use case is reachable and its accessible models are enumerated (Pillar 1, Inventory). AWS = Bedrock models/guardrails (Enhanced); GCP = Vertex AI models/endpoints; Azure = Azure OpenAI accounts.",
    providers: ["openai", "anthropic", "aws", "gcp", "azure"],
    defaultValidityHours: 168,
    recheckTrigger: "weekly",
    maturity: 1,
  },
  threat_detection_enabled: {
    id: "threat_detection_enabled",
    label: "Threat detection enabled",
    description: "Cloud-native threat detection (e.g. AWS GuardDuty) is enabled for the account hosting the AI workload (Pillar 9).",
    providers: ["aws"],
    defaultValidityHours: 24,
    recheckTrigger: "config_drift",
    maturity: 1,
  },
  sso_app_inventory: {
    id: "sso_app_inventory",
    label: "SSO application inventory",
    description: "The applications federated through the identity provider are enumerated — a Pillar 1 inventory signal for what the IdP brokers access to.",
    providers: ["okta"],
    defaultValidityHours: 168,
    recheckTrigger: "weekly",
    maturity: 1,
  },
  agent_tracing_enabled: {
    id: "agent_tracing_enabled",
    label: "Agent tracing enabled",
    description: "Agent traces / evaluations are being captured for AI workloads (Pillar 9, Monitoring).",
    providers: ["langsmith"],
    defaultValidityHours: 24,
    recheckTrigger: "config_drift",
    maturity: 1,
  },
  secrets_management: {
    id: "secrets_management",
    label: "Secrets management healthy",
    description: "A secrets manager is healthy and in use, so AI credentials are vaulted rather than hard-coded (Pillar 2).",
    providers: ["vault"],
    defaultValidityHours: 168,
    recheckTrigger: "weekly",
    maturity: 1,
  },
  data_access_governance: {
    id: "data_access_governance",
    label: "Data-access governance in place",
    description: "Access grants govern the data the AI can reach in the data warehouse (Pillar 3, Data Boundary).",
    providers: ["snowflake"],
    defaultValidityHours: 168,
    recheckTrigger: "weekly",
    maturity: 1,
  },
  model_dataset_governance: {
    id: "model_dataset_governance",
    label: "Model + dataset governance",
    description: "Models and datasets are governed in a catalog (e.g. Unity Catalog) — Pillar 1 / Pillar 3.",
    providers: ["databricks"],
    defaultValidityHours: 168,
    recheckTrigger: "weekly",
    maturity: 1,
  },
  data_classification: {
    id: "data_classification",
    label: "Data classification configured",
    description: "Data classification / DLP coverage exists for the AI's data boundary (Pillar 3).",
    providers: ["purview"],
    defaultValidityHours: 168,
    recheckTrigger: "weekly",
    maturity: 1,
  },
  workload_observability: {
    id: "workload_observability",
    label: "AI workload observability",
    description: "An observability platform is monitoring the AI workload — logs/metrics indexes exist (Pillar 9).",
    providers: ["datadog"],
    defaultValidityHours: 24,
    recheckTrigger: "config_drift",
    maturity: 1,
  },
};

export function getCapability(id: string): CapabilityDef | null {
  return CAPABILITIES[id] ?? null;
}
