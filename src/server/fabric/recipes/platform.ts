import type { ProviderRecipe, PreflightResult } from "./types";
import { safeJson, pass, fail, guarded, reachable } from "./helpers";

/** Data / secrets / observability connectors (roadmap, authored_untested, gated
 *  until live-validated). Read-only checks against documented APIs. */

export const vaultRecipe: ProviderRecipe = {
  id: "vault",
  name: "HashiCorp Vault",
  category: "Identity",
  accent: "#ffec6e",
  maturity: "authored_untested",
  summary: "Read-only check that a Vault secrets manager is healthy and in use — AI credentials vaulted, not hard-coded.",
  auth: {
    method: "api_token",
    broker: "native",
    scopes: ["read-only: sys/health, auth/token/lookup-self"],
    defaults: { authHeaderName: "X-Vault-Token" },
    fields: [
      { key: "baseUrl", label: "Vault address", placeholder: "https://vault.example.com:8200" },
      { key: "token", label: "Vault token", secret: true, help: "A read-only token (a periodic token for a policy with read on sys/health)." },
    ],
    setup: [
      { title: "Create a read-only token", detail: "vault token create -policy=neo-readonly with read on sys/health (and any paths you want inventoried)." },
      { title: "Enter the address + token", detail: "Neo calls Vault read-only over TLS, token sent in the X-Vault-Token header." },
    ],
  },
  async preflight(client) {
    return [await reachable(client, "/v1/auth/token/lookup-self", "Token valid + Vault reachable")];
  },
  capabilities: [
    {
      capabilityId: "secrets_management",
      label: "Vault is initialized and unsealed",
      unlocksControls: ["secrets-management", "credential-handling"],
      freshnessHours: 168,
      run: (client) => guarded(async () => {
        const res = await client.request("/v1/sys/health?standbyok=true&perfstandbyok=true");
        const j = await safeJson(res);
        const initialized = j?.initialized === true;
        const sealed = j?.sealed === true;
        return initialized && !sealed
          ? pass("Vault is initialized and unsealed.", { initialized, sealed })
          : fail(`Vault not ready (initialized=${initialized}, sealed=${sealed}).`, "Unseal Vault and confirm it is initialized.");
      }),
    },
  ],
};

export const snowflakeRecipe: ProviderRecipe = {
  id: "snowflake",
  name: "Snowflake",
  category: "Data",
  accent: "#29b5e8",
  maturity: "authored_untested",
  summary: "Read-only check (Snowflake SQL API, programmatic access token) that role-based access governs the data warehouse.",
  auth: {
    method: "api_token",
    broker: "native",
    scopes: ["read-only SQL API: SELECT 1, SHOW ROLES"],
    baseUrlTemplate: "https://{account}.snowflakecomputing.com",
    defaults: { scheme: "Bearer", staticHeaders: JSON.stringify({ "X-Snowflake-Authorization-Token-Type": "PROGRAMMATIC_ACCESS_TOKEN", "Content-Type": "application/json" }) },
    fields: [
      { key: "account", label: "Account identifier", placeholder: "orgname-accountname", help: "Your account locator, e.g. orgname-accountname (the host prefix of your Snowflake URL)." },
      { key: "token", label: "Programmatic access token", secret: true, help: "Snowsight → user → Generate programmatic access token (PAT), scoped to a read-only role." },
    ],
    setup: [
      { title: "Generate a PAT", detail: "Snowsight → your user → Settings → Programmatic access tokens → Generate, bound to a read-only role." },
      { title: "Enter account + token", detail: "Neo calls the SQL API read-only (SELECT 1, SHOW ROLES). No data rows are read." },
    ],
  },
  async preflight(client): Promise<PreflightResult[]> {
    const label = "PAT valid + Snowflake SQL API reachable";
    try {
      const res = await client.request("/api/v2/statements", { method: "POST", body: JSON.stringify({ statement: "SELECT 1", timeout: 60 }) });
      if (res.status === 401 || res.status === 403) return [{ id: "auth", label, state: "auth_failed", detail: `HTTP ${res.status}` }];
      if (!res.ok) return [{ id: "auth", label, state: "unreachable", detail: `HTTP ${res.status}` }];
      return [{ id: "auth", label, state: "ready" }];
    } catch (e) {
      return [{ id: "auth", label, state: "unreachable", detail: e instanceof Error ? e.message : "error" }];
    }
  },
  capabilities: [
    {
      capabilityId: "data_access_governance",
      label: "Role-based access is in use (RBAC roles beyond defaults)",
      unlocksControls: ["data-access-control", "least-privilege"],
      freshnessHours: 168,
      run: (client) => guarded(async () => {
        const res = await client.request("/api/v2/statements", { method: "POST", body: JSON.stringify({ statement: "SHOW ROLES", timeout: 60 }) });
        const j = await safeJson(res);
        const rows = (j?.data as unknown[]) ?? [];
        const n = Number((j?.resultSetMetaData as { numRows?: number } | undefined)?.numRows ?? rows.length);
        return n >= 3
          ? pass(`${n} Snowflake roles — RBAC governs data access.`, { roles: n })
          : fail(`Only ${n} role(s) found — limited RBAC.`, "Define least-privilege roles that gate access to the AI's data.");
      }),
    },
  ],
};

export const databricksRecipe: ProviderRecipe = {
  id: "databricks",
  name: "Databricks",
  category: "Data",
  accent: "#ff3621",
  maturity: "authored_untested",
  summary: "Read-only check that Unity Catalog governs models and datasets in the workspace.",
  auth: {
    method: "api_token",
    broker: "native",
    scopes: ["read-only: clusters/spark-versions, unity-catalog/catalogs"],
    baseUrlTemplate: "https://{host}",
    defaults: { scheme: "Bearer" },
    fields: [
      { key: "host", label: "Workspace host", placeholder: "dbc-xxxxxxxx-xxxx.cloud.databricks.com", help: "Your workspace URL host (no https://)." },
      { key: "token", label: "Personal access token", secret: true, help: "User Settings → Developer → Access tokens → Generate." },
    ],
    setup: [
      { title: "Generate a PAT", detail: "Databricks → User Settings → Developer → Access tokens → Generate new token." },
      { title: "Enter host + token", detail: "Neo reads cluster + Unity Catalog metadata, read-only. No data is read." },
    ],
  },
  async preflight(client) {
    return [await reachable(client, "/api/2.0/clusters/spark-versions", "PAT valid + Databricks reachable")];
  },
  capabilities: [
    {
      capabilityId: "model_dataset_governance",
      label: "Unity Catalog is in use (catalogs exist)",
      unlocksControls: ["model-inventory", "data-governance"],
      freshnessHours: 168,
      run: (client) => guarded(async () => {
        const res = await client.request("/api/2.1/unity-catalog/catalogs");
        const j = await safeJson(res);
        const catalogs = (j?.catalogs as unknown[]) ?? [];
        return catalogs.length > 0
          ? pass(`${catalogs.length} Unity Catalog catalog(s) governing models/datasets.`, { catalogs: catalogs.length })
          : fail("No Unity Catalog catalogs found.", "Enable Unity Catalog and register your models/datasets under it.");
      }),
    },
  ],
};

export const purviewRecipe: ProviderRecipe = {
  id: "purview",
  name: "Microsoft Purview",
  category: "Data",
  accent: "#0078d4",
  maturity: "authored_untested",
  summary: "Read-only check that data classifications are configured in Purview — coverage for the AI's data boundary.",
  auth: {
    method: "oauth2_client_credentials",
    broker: "native",
    scopes: ["read-only Data Map: types/typedefs"],
    baseUrlTemplate: "https://{account}.purview.azure.com",
    tokenUrlTemplate: "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token",
    scope: "https://purview.azure.net/.default",
    fields: [
      { key: "account", label: "Purview account name", placeholder: "my-purview-account" },
      { key: "tenantId", label: "Directory (tenant) ID", placeholder: "00000000-0000-0000-0000-000000000000" },
      { key: "clientId", label: "App (client) ID" },
      { key: "clientSecret", label: "Client secret", secret: true },
    ],
    setup: [
      { title: "Register an app + grant Data Reader", detail: "Entra ID → App registrations → new app + secret. In Purview, give the app the Data Reader role on the collection." },
      { title: "Enter the four fields", detail: "Neo reads the Data Map type definitions read-only to confirm classifications exist." },
    ],
  },
  async preflight(client) {
    return [await reachable(client, "/datamap/api/atlas/v2/types/typedefs?type=classification", "Token acquired + Purview reachable")];
  },
  capabilities: [
    {
      capabilityId: "data_classification",
      label: "Classifications are defined in Purview",
      unlocksControls: ["data-classification", "data-governance"],
      freshnessHours: 168,
      run: (client) => guarded(async () => {
        const res = await client.request("/datamap/api/atlas/v2/types/typedefs?type=classification");
        const j = await safeJson(res);
        const defs = (j?.classificationDefs as unknown[]) ?? [];
        return defs.length > 0
          ? pass(`${defs.length} classification definition(s) configured.`, { classifications: defs.length })
          : fail("No classification definitions found.", "Define data classifications / sensitivity labels in Purview.");
      }),
    },
  ],
};

export const datadogRecipe: ProviderRecipe = {
  id: "datadog",
  name: "Datadog",
  category: "Monitoring",
  accent: "#632ca6",
  maturity: "authored_untested",
  summary: "Read-only check that log indexes exist in Datadog — evidence the AI workload is observable.",
  auth: {
    method: "api_token",
    broker: "native",
    scopes: ["read-only: validate, logs/config/indexes"],
    baseUrlTemplate: "https://api.{site}",
    // DD-API-KEY (primary) + DD-APPLICATION-KEY (second user secret), no Authorization
    defaults: { authHeaderName: "DD-API-KEY", fieldHeaders: JSON.stringify({ "DD-APPLICATION-KEY": "appKey" }) },
    fields: [
      { key: "site", label: "Datadog site", placeholder: "datadoghq.com", help: "e.g. datadoghq.com, datadoghq.eu, us3.datadoghq.com" },
      { key: "token", label: "API key", secret: true, help: "Organization Settings → API Keys" },
      { key: "appKey", label: "Application key", secret: true, help: "Organization Settings → Application Keys (read scopes)" },
    ],
    setup: [
      { title: "Create an API key + Application key", detail: "Datadog → Organization Settings → API Keys and Application Keys. The app key needs read scopes (logs_read_index_data)." },
      { title: "Enter site + both keys", detail: "Neo validates the keys and lists log indexes, read-only." },
    ],
  },
  async preflight(client) {
    return [await reachable(client, "/api/v1/validate", "API key valid + Datadog reachable")];
  },
  capabilities: [
    {
      capabilityId: "workload_observability",
      label: "Log indexes exist (workload is observable)",
      unlocksControls: ["logging-and-monitoring", "observability"],
      freshnessHours: 24,
      run: (client) => guarded(async () => {
        const res = await client.request("/api/v1/logs/config/indexes");
        const j = await safeJson(res);
        const indexes = (j?.indexes as unknown[]) ?? [];
        return indexes.length > 0
          ? pass(`${indexes.length} Datadog log index(es) configured.`, { indexes: indexes.length })
          : fail("No log indexes found.", "Configure log ingestion + an index for the AI workload in Datadog.");
      }),
    },
  ],
};

export const platformRecipes = [vaultRecipe, snowflakeRecipe, databricksRecipe, purviewRecipe, datadogRecipe];
