import type { ProviderRecipe } from "./types";
import { safeJson, pass, fail, guarded, reachable } from "./helpers";

/** ITSM — both satisfy `change_management_linked`: AI changes are governed
 *  through a real change-management system of record. */

export const servicenowRecipe: ProviderRecipe = {
  id: "servicenow",
  name: "ServiceNow",
  category: "Workflow",
  accent: "#62d84e",
  maturity: "verified",
  summary: "Confirm change management is in use for AI changes.",
  auth: {
    method: "api_token",
    broker: "native",
    scopes: ["read-only (itil / change_request read)"],
    baseUrlTemplate: "https://{instance}.service-now.com",
    fields: [
      { key: "instance", label: "Instance", placeholder: "acme (from acme.service-now.com)" },
      { key: "basicUser", label: "Integration user", placeholder: "neo.readonly" },
      { key: "token", label: "Password", secret: true },
    ],
    setup: [
      { title: "Create a read-only integration user", detail: "Assign a role with read on change_request (e.g. itil or a custom read-only role)." },
      { title: "Enter instance + credentials", detail: "Neo authenticates with Basic over TLS; store as a dedicated read-only account." },
    ],
  },
  async preflight(client) {
    return [await reachable(client, "/api/now/table/sys_user?sysparm_limit=1", "Credentials valid")];
  },
  capabilities: [
    {
      capabilityId: "change_management_linked",
      label: "Change management in use",
      unlocksControls: ["change-management", "governance"],
      freshnessHours: 168,
      run: (client) => guarded(async () => {
        const res = await client.request("/api/now/table/change_request?sysparm_limit=5&sysparm_query=ORDERBYDESCsys_created_on");
        const j = await safeJson(res);
        const rows = (j?.result as unknown[]) ?? [];
        return rows.length > 0
          ? pass(`${rows.length} recent change request(s) found.`, { recent: rows.length })
          : fail("No change requests found.", "Route AI changes through ServiceNow Change Management, or grant read on change_request.");
      }),
    },
  ],
};

export const jiraRecipe: ProviderRecipe = {
  id: "jira",
  name: "Jira",
  category: "Workflow",
  accent: "#2684ff",
  maturity: "verified",
  summary: "Confirm change/approval issues exist for AI work.",
  auth: {
    method: "api_token",
    broker: "native",
    scopes: ["read:jira-work"],
    baseUrlTemplate: "https://{site}.atlassian.net",
    fields: [
      { key: "site", label: "Site", placeholder: "acme (from acme.atlassian.net)" },
      { key: "basicUser", label: "Account email", placeholder: "you@acme.com" },
      { key: "token", label: "API token", secret: true, help: "id.atlassian.com → Security → API tokens" },
    ],
    setup: [
      { title: "Create an Atlassian API token", detail: "id.atlassian.com → Security → Create API token." },
      { title: "Enter site + email + token", detail: "Neo uses Basic (email:token) over TLS, read-only." },
    ],
  },
  async preflight(client) {
    return [await reachable(client, "/rest/api/3/myself", "Token valid")];
  },
  capabilities: [
    {
      capabilityId: "change_management_linked",
      label: "Change issues tracked",
      unlocksControls: ["change-management", "governance"],
      freshnessHours: 168,
      run: (client) => guarded(async () => {
        const jql = encodeURIComponent('issuetype in ("Change", "Change Request") ORDER BY created DESC');
        const res = await client.request(`/rest/api/3/search?jql=${jql}&maxResults=1`);
        const j = await safeJson(res);
        const total = Number(j?.total ?? 0);
        return total > 0
          ? pass(`${total} change issue(s) tracked.`, { total })
          : fail("No Change-type issues found.", "Track AI changes as Change issues, or adjust the JQL/issue type to match your workflow.");
      }),
    },
  ],
};

export const itsmRecipes = [servicenowRecipe, jiraRecipe];
