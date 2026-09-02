import { BRAND } from "@/lib/brand";
/** Per-provider help shown inline on each integration connect page:
 *  prerequisites, what Neo reads, what PASS means, and troubleshooting. */

export interface IntegrationHelp {
  prerequisites: string[];
  whatWeRead: string;
  passMeans: string;
  troubleshooting: { problem: string; fix: string }[];
}

export const INTEGRATION_HELP: Record<string, IntegrationHelp> = {
  github: {
    prerequisites: [
      "Admin on the GitHub org/account to install a GitHub App",
      `The repository you want ${BRAND.name} to verify`,
    ],
    whatWeRead: `Repository contents only (read-only). ${BRAND.name} stores just a non-secret installation id — never a token.`,
    passMeans: "A valid CycloneDX ML-BOM (e.g. ai-bom.json) exists in the repo.",
    troubleshooting: [
      { problem: "Installation token failed (404)", fix: "Wrong installation id, or the App isn't installed on this account. Use 'Find my installation id'." },
      { problem: "Repo not accessible", fix: "Install the App on that repo with Contents: Read (or add the repo to the installation)." },
      { problem: "FAIL: no AI-BOM found", fix: "Commit a CycloneDX ML-BOM (ai-bom.json) listing model lineage, dataset licenses, and dependencies." },
    ],
  },
  aws: {
    prerequisites: [
      `An AWS account you want ${BRAND.name} to read`,
      "Permission to run CloudFormation and create an IAM role (Administrator, or IAM full access + CloudFormation)",
    ],
    whatWeRead: "Read-only, via a short-lived assumed role bound by an external id. No access keys are stored.",
    passMeans: "A multi-region CloudTrail trail exists.",
    troubleshooting: [
      { problem: "403 AssumeRole (AccessDenied)", fix: "The external id is stale. Delete the stack (aws cloudformation delete-stack --stack-name neo-readonly), reload this page, re-run the script, reconnect." },
      { problem: "Stack UPDATE_ROLLBACK_FAILED", fix: "Delete the neo-readonly stack and re-run the current script (the env var NEXT_PUBLIC_NEO_AWS_ACCOUNT_ID must be set)." },
      { problem: "FAIL: no multi-region trail", fix: "CloudTrail → Create trail → apply to all regions." },
    ],
  },
  gcp: {
    prerequisites: [
      "A GCP project",
      "Owner (or Project IAM Admin + Service Account Admin) to create the service account and grant roles",
    ],
    whatWeRead: "Read-only, via a service account with viewer + logging.viewer.",
    passMeans: "Data Access audit logging (Data Read + Data Write) is enabled.",
    troubleshooting: [
      { problem: "gcloud: project not set", fix: "Enter your Project ID in the field above the script so it's baked in." },
      { problem: "PARTIAL: only one of Data Read/Write", fix: "Enable both: IAM & Admin → Audit Logs → tick Data Read + Data Write → Save." },
      { problem: "FAIL: data access logging off", fix: "IAM & Admin → Audit Logs → select services → Data Read + Data Write → Save." },
    ],
  },
  azure: {
    prerequisites: [
      "An Azure subscription",
      "Owner or User Access Administrator on the subscription (to assign Reader)",
      "Ability to register an app (Entra role Application Developer or higher)",
    ],
    whatWeRead: "Read-only, via an app registration with the Reader role. No admin consent needed (ARM uses RBAC).",
    passMeans: "The subscription's Activity Log is exported via a diagnostic setting.",
    troubleshooting: [
      { problem: "Script never prints 'Reader assigned.'", fix: "You lack Owner / User Access Administrator on the subscription, or can't register apps. Get those rights and re-run." },
      { problem: "Wrong subscription", fix: "Run az account set --subscription \"<name or id>\" before the script." },
      { problem: "FAIL: no diagnostic setting", fix: "Monitor → Activity log → Export Activity Logs → Add diagnostic setting → Log Analytics workspace." },
    ],
  },
  okta: {
    prerequisites: ["Okta admin access to create a read-only API token"],
    whatWeRead: "Read-only directory/policy via an SSWS API token.",
    passMeans: "An active MFA enrollment policy exists.",
    troubleshooting: [
      { problem: "Preflight 401", fix: "Token is wrong/expired, or the org URL has a trailing slash." },
      { problem: "FAIL: no active MFA policy", fix: "Security → Authenticators / Policies → activate an MFA enrollment policy." },
    ],
  },
  entra: {
    prerequisites: [
      "Entra admin to create an app registration",
      "Application permissions Policy.Read.All + Organization.Read.All, with admin consent granted",
      "Conditional Access requires Entra ID P1",
    ],
    whatWeRead: "Read-only Graph policy/org metadata.",
    passMeans: "MFA is enforced — via an enabled Conditional Access policy, or via Security Defaults.",
    troubleshooting: [
      { problem: "Preflight 403", fix: "Admin consent wasn't granted — Entra → App registrations → API permissions → Grant admin consent." },
      { problem: "FAIL: MFA not enforced", fix: "Turn on Security Defaults (Entra → Properties), or create a Conditional Access policy requiring MFA (needs Entra ID P1)." },
    ],
  },
  google_workspace: {
    prerequisites: [
      "A service account with domain-wide delegation",
      "Its client id authorized in Admin console for admin.directory.user.readonly",
      "A super-admin email for the SA to impersonate",
    ],
    whatWeRead: "Read-only directory via the delegated service account.",
    passMeans: "Sampled active users are enrolled in 2-step verification.",
    troubleshooting: [
      { problem: "unauthorized_client", fix: "Delegation isn't authorized for that exact scope, or the admin subject is wrong." },
      { problem: "FAIL: users not enrolled", fix: "Admin → Security → enforce 2-step verification." },
    ],
  },
  servicenow: {
    prerequisites: ["A read-only integration user with read on change_request (itil or a custom role)"],
    whatWeRead: "Read-only change_request records.",
    passMeans: "Recent change requests exist.",
    troubleshooting: [
      { problem: "401", fix: "Wrong user/password." },
      { problem: "FAIL: no change requests", fix: "Route AI changes through Change Management, or grant read on change_request." },
    ],
  },
  jira: {
    prerequisites: [
      "An Atlassian API token (id.atlassian.com → Security → API tokens)",
      "The token's user can read the project(s)",
    ],
    whatWeRead: "Read-only issues via an API token (Basic email:token).",
    passMeans: "Change-type issues exist.",
    troubleshooting: [
      { problem: "401", fix: "Wrong account email or token." },
      { problem: "FAIL: no Change issues", fix: "Track AI changes as Change issues, or adjust the issue type / JQL in the recipe." },
    ],
  },
  splunk: {
    prerequisites: [
      "A Splunk authentication token (Settings → Tokens) for a read-only role",
      "The REST endpoint reachable — Cloud: https://<stack>.splunkcloud.com:8089",
    ],
    whatWeRead: "Read-only REST — server info + index metadata (event counts). Never event contents.",
    passMeans: "At least one non-internal index is actively holding events (logs are being ingested).",
    troubleshooting: [
      { problem: "TLS / certificate error on :8089", fix: "On-prem self-signed certs can block the call — use a valid cert or the Cloud API endpoint." },
      { problem: "Preflight 401", fix: "Token is wrong/expired, or the role lacks REST access." },
      { problem: "FAIL: no index has events", fix: "Forward your AI workload logs to a Splunk index (Settings → Data inputs / forwarders)." },
    ],
  },
  openai: {
    prerequisites: ["An OpenAI API key (platform.openai.com → API keys)"],
    whatWeRead: "Read-only: GET /v1/models. No prompts, completions, or content are read.",
    passMeans: "The key can access at least one model (models enumerated as Pillar 1 inventory).",
    troubleshooting: [
      { problem: "Preflight 401", fix: "API key is wrong, revoked, or from a different org/project. Create a new key at platform.openai.com → API keys." },
      { problem: "FAIL: no models returned", fix: "The key has no model access — check the project's model permissions and billing status." },
    ],
  },
  anthropic: {
    prerequisites: ["An Anthropic API key (console.anthropic.com → Settings → API keys)"],
    whatWeRead: "Read-only: GET /v1/models. No prompts or content are read.",
    passMeans: "The key can access at least one Claude model.",
    troubleshooting: [
      { problem: "Preflight 401", fix: "API key wrong or revoked — create a new one at console.anthropic.com → Settings → API keys." },
      { problem: "400 missing anthropic-version", fix: `${BRAND.name} sends the required version header automatically; if you see this, reconnect so the stored header is applied.` },
      { problem: "FAIL: no models returned", fix: "Confirm the key is active and the workspace has model access." },
    ],
  },
  langsmith: {
    prerequisites: ["A LangSmith API key (smith.langchain.com → Settings → API keys)"],
    whatWeRead: "Read-only: lists tracing projects (sessions). Trace contents are never read.",
    passMeans: "At least one tracing project exists (agents are being traced).",
    troubleshooting: [
      { problem: "Preflight 401", fix: "API key wrong/expired, or from a different region. Create a new key in smith.langchain.com → Settings." },
      { problem: "FAIL: no tracing projects", fix: "Send traces to LangSmith — set LANGCHAIN_TRACING_V2=true and a LANGCHAIN_PROJECT in your app." },
    ],
  },
  vault: {
    prerequisites: [
      "A Vault address reachable over TLS (e.g. HCP Vault — a local `vault -dev` on localhost won't be reachable)",
      "A read-only token whose policy allows read on sys/health",
    ],
    whatWeRead: "Read-only: token self-lookup + sys/health (initialized/sealed status). No secret values are read.",
    passMeans: "Vault is initialized and unsealed.",
    troubleshooting: [
      { problem: "Unreachable", fix: "The address must be publicly reachable over TLS — use HCP Vault or a public endpoint, not localhost." },
      { problem: "Preflight 403 / permission denied", fix: "Use a token whose policy allows read on sys/health (a root/dev token works for testing)." },
      { problem: "FAIL: sealed or not initialized", fix: "Unseal Vault (vault operator unseal) and confirm it's initialized." },
    ],
  },
  snowflake: {
    prerequisites: [
      "A Snowflake account identifier (orgname-accountname)",
      "A programmatic access token (PAT) scoped to a read-only role, with the SQL API reachable",
    ],
    whatWeRead: "Read-only SQL API: SELECT 1 and SHOW ROLES. No table data is read.",
    passMeans: "Multiple RBAC roles exist — role-based access governs the data.",
    troubleshooting: [
      { problem: "Preflight 401 / invalid token", fix: `PAT wrong/expired, or the token-type header is missing — reconnect so ${BRAND.name} applies it. Confirm PATs are enabled for your account.` },
      { problem: "Account not found / wrong host", fix: `Enter the account identifier (orgname-accountname) only, not the full URL — ${BRAND.name} builds https://{account}.snowflakecomputing.com.` },
      { problem: "Statement needs a warehouse", fix: "Give the token's role a default warehouse so statements can execute." },
      { problem: "FAIL: too few roles", fix: "Define least-privilege roles that gate access to the AI's data (beyond the default ACCOUNTADMIN/PUBLIC)." },
    ],
  },
  databricks: {
    prerequisites: [
      "A Databricks workspace with Unity Catalog enabled (Community Edition is not sufficient)",
      "A personal access token (User Settings → Developer → Access tokens)",
    ],
    whatWeRead: "Read-only: cluster spark-versions + Unity Catalog catalog list. No data is read.",
    passMeans: "At least one Unity Catalog catalog exists (models/datasets are governed).",
    troubleshooting: [
      { problem: "Preflight 401 / 403", fix: "PAT wrong/expired, or the user lacks workspace access. Generate a new token in User Settings → Developer." },
      { problem: "Wrong host", fix: "Enter the workspace host only (e.g. dbc-xxxx.cloud.databricks.com), without https://." },
      { problem: "FAIL: no catalogs / UC not enabled", fix: "Enable Unity Catalog and register your models/datasets — Community Edition can't; use a trial workspace." },
    ],
  },
  purview: {
    prerequisites: [
      "A Microsoft Purview account",
      "An Entra app registration (client id + secret)",
      "The app granted the Data Reader role on the Purview collection",
    ],
    whatWeRead: "Read-only Data Map: classification type definitions. No catalog asset contents are read.",
    passMeans: "Classification definitions are configured.",
    troubleshooting: [
      { problem: "Token exchange failed", fix: "Wrong tenant id / client id / secret, or the secret expired. Re-create the client secret in Entra → App registrations." },
      { problem: "403 on the Data Map API", fix: "Grant the app the Data Reader (or Data Curator) role on the Purview collection." },
      { problem: "404 / endpoint changed", fix: "Purview is migrating into Microsoft Fabric — if the Data Map host/path differs for your tenant, send us the error and we'll update the recipe." },
      { problem: "FAIL: no classifications", fix: "Define classifications / sensitivity labels in Purview." },
    ],
  },
  datadog: {
    prerequisites: [
      "A Datadog API key + Application key (Organization Settings)",
      "The Application key with the logs_read_index_data scope",
      "Your Datadog site (datadoghq.com, .eu, us3, …)",
    ],
    whatWeRead: "Read-only: key validation + log index list. No log contents are read.",
    passMeans: "At least one log index is configured (the workload is observable).",
    troubleshooting: [
      { problem: "Preflight 403 on /validate", fix: "API key wrong, or the site doesn't match — confirm the site (it sets the base URL: api.datadoghq.com vs .eu vs us3)." },
      { problem: "403 on logs/config/indexes", fix: "The Application key needs the logs_read_index_data scope — create an app key with read scopes." },
      { problem: "FAIL: no log indexes", fix: "Configure log ingestion and an index for the AI workload in Datadog." },
    ],
  },
};

export function getIntegrationHelp(id: string): IntegrationHelp | null {
  return INTEGRATION_HELP[id] ?? null;
}
