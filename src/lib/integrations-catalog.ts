/** Integrations catalog — the org-level systems the Governed AI Integration
 *  Fabric connects to. Read-first: every integration verifies control evidence;
 *  none writes to customer systems. GitHub uses a native App connector; the rest
 *  are recipe-driven (src/server/fabric/recipes). All demo-gated while testing. */

export type IntegrationStatus = "available" | "coming_soon";

export interface IntegrationDef {
  id: string; // provider key, matches org_connections.provider
  name: string;
  category: string;
  status: IntegrationStatus;
  validating?: boolean; // connectable but not yet customer-verified — show a "Validating" tag
  blurb: string;
  powers: string[];
  reads: string;
  accent: string;
  href: string;
}

const D = (id: string) => `/dashboard/integrations/${id}`;

export const INTEGRATIONS: IntegrationDef[] = [
  {
    id: "github", name: "GitHub", category: "Source & Artifacts", status: "available",
    blurb: "Verify that AI use cases carry the technical evidence their risk tier requires, straight from your repos.",
    powers: ["AI-BOM present & valid (CycloneDX ML-BOM)"],
    reads: "Repository contents (read-only). Stores only a non-secret installation id.",
    accent: "#6e7681", href: D("github"),
  },
  {
    id: "aws", name: "AWS", category: "Cloud", status: "available",
    blurb: "Read-only checks for audit logging and model-endpoint guardrails across your AWS account.",
    powers: ["Cloud audit logging enabled"],
    reads: "Read-only via a short-lived assumed role (external id). No stored keys.",
    accent: "#ff9900", href: D("aws"),
  },
  {
    id: "gcp", name: "Google Cloud", category: "Cloud", status: "available",
    blurb: "Read-only checks for Cloud Audit Logs and Vertex AI posture in a GCP project.",
    powers: ["Cloud audit logging enabled"],
    reads: "Read-only via a service account (viewer + logging.viewer).",
    accent: "#4285f4", href: D("gcp"),
  },
  {
    id: "azure", name: "Azure", category: "Cloud", status: "available",
    blurb: "Read-only checks for diagnostic/activity logging and Azure OpenAI content filters.",
    powers: ["Cloud audit logging enabled"],
    reads: "Read-only via an app registration with the Reader role.",
    accent: "#0078d4", href: D("azure"),
  },
  {
    id: "okta", name: "Okta", category: "Identity", status: "available",
    blurb: "Confirm MFA enforcement for the identities around an AI use case.",
    powers: ["MFA enforced"],
    reads: "Read-only directory/policy via an API token.",
    accent: "#00297a", href: D("okta"),
  },
  {
    id: "entra", name: "Entra ID", category: "Identity", status: "available",
    blurb: "Confirm a Conditional Access policy requires MFA.",
    powers: ["MFA enforced"],
    reads: "Read-only Graph policy/org metadata (Policy.Read.All).",
    accent: "#0078d4", href: D("entra"),
  },
  {
    id: "google_workspace", name: "Google Workspace", category: "Identity", status: "available", validating: true,
    blurb: "Confirm users are enrolled in 2-step verification.",
    powers: ["MFA enforced"],
    reads: "Read-only directory via a delegated service account.",
    accent: "#ea4335", href: D("google_workspace"),
  },
  {
    id: "servicenow", name: "ServiceNow", category: "Workflow", status: "available",
    blurb: "Confirm change management governs AI changes.",
    powers: ["Change management linked"],
    reads: "Read-only change_request records.",
    accent: "#62d84e", href: D("servicenow"),
  },
  {
    id: "jira", name: "Jira", category: "Workflow", status: "available",
    blurb: "Confirm change/approval issues exist for AI work.",
    powers: ["Change management linked"],
    reads: "Read-only issues via an API token.",
    accent: "#2684ff", href: D("jira"),
  },
  {
    id: "splunk", name: "Splunk", category: "SIEM", status: "available", validating: true,
    blurb: "Verify your SIEM is actively ingesting AI workload logs — evidence for monitoring.",
    powers: ["SIEM log ingestion"],
    reads: "Read-only REST (server info + index metadata) via an auth token. No event contents.",
    accent: "#65a637", href: D("splunk"),
  },

  // ── Coming soon (roadmap) ─────────────────────────────────────────────
  {
    id: "openai", name: "OpenAI", category: "AI Platform", status: "available",
    blurb: "Confirm model usage and guardrail configuration for the OpenAI models behind a use case.",
    powers: ["AI platform inventoried"], reads: "Read-only via an API key (GET /v1/models). No prompts or content read.",
    accent: "#10a37f", href: D("openai"),
  },
  {
    id: "anthropic", name: "Anthropic", category: "AI Platform", status: "available",
    blurb: "Confirm model usage and safety settings for the Claude models behind a use case.",
    powers: ["AI platform inventoried"], reads: "Read-only via an API key (GET /v1/models). No prompts or content read.",
    accent: "#d97757", href: D("anthropic"),
  },
  {
    id: "langsmith", name: "LangSmith", category: "Observability", status: "available",
    blurb: "Evidence that agent traces and evaluations are captured for AI workloads.",
    powers: ["Agent tracing enabled"], reads: "Read-only via an API key (tracing projects). Trace contents are not read.",
    accent: "#1c3c3c", href: D("langsmith"),
  },
  {
    id: "vault", name: "HashiCorp Vault", category: "Identity", status: "available", validating: true,
    blurb: "Confirm a Vault secrets manager is healthy and in use — AI credentials vaulted, not hard-coded.",
    powers: ["Secrets management healthy"], reads: "Read-only via a token (sys/health). No secret values read.",
    accent: "#ffec6e", href: D("vault"),
  },
  {
    id: "snowflake", name: "Snowflake", category: "Data", status: "available", validating: true,
    blurb: "Read-only check (SQL API, programmatic access token) that role-based access governs the data warehouse.",
    powers: ["Data-access governance"], reads: "Read-only SQL API (SELECT 1, SHOW ROLES). No table data read.",
    accent: "#29b5e8", href: D("snowflake"),
  },
  {
    id: "databricks", name: "Databricks", category: "Data", status: "available", validating: true,
    blurb: "Confirm Unity Catalog governs models and datasets in the workspace.",
    powers: ["Model + dataset governance"], reads: "Read-only cluster + Unity Catalog metadata. No data read.",
    accent: "#ff3621", href: D("databricks"),
  },
  {
    id: "purview", name: "Microsoft Purview", category: "Data", status: "available", validating: true,
    blurb: "Evidence that data classifications are configured in Purview — coverage for the AI's data boundary.",
    powers: ["Data classification configured"], reads: "Read-only Data Map type definitions. No asset contents read.",
    accent: "#0078d4", href: D("purview"),
  },
  {
    id: "datadog", name: "Datadog", category: "Monitoring", status: "available", validating: true,
    blurb: "Read-only check that log indexes exist in Datadog — evidence the AI workload is observable.",
    powers: ["AI workload observability"], reads: "Read-only key validation + log index list. No log contents read.",
    accent: "#632ca6", href: D("datadog"),
  },
];

export function getIntegration(id: string): IntegrationDef | null {
  return INTEGRATIONS.find((i) => i.id === id) ?? null;
}
