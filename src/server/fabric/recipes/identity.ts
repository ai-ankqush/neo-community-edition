import type { ProviderRecipe } from "./types";
import { safeJson, pass, fail, guarded, reachable } from "./helpers";

/** Identity providers — all satisfy `mfa_enforced`, the clean "capability not
 *  vendor" demo. Okta = API token, Entra = OAuth2 client-creds (Graph),
 *  Google Workspace = service account w/ domain-wide delegation. */

export const oktaRecipe: ProviderRecipe = {
  id: "okta",
  name: "Okta",
  category: "Identity",
  accent: "#00297a",
  maturity: "verified",
  summary: "Confirm MFA enrollment policy is active for the org.",
  auth: {
    method: "api_token",
    broker: "native",
    scopes: ["okta.policies.read", "okta.users.read", "okta.apps.read"],
    defaults: { scheme: "SSWS" },
    fields: [
      { key: "baseUrl", label: "Okta org URL", placeholder: "https://acme.okta.com", help: "Your Okta domain, no trailing slash." },
      { key: "token", label: "API token", secret: true, help: "The token string from the step below." },
    ],
    setup: [
      { title: "Create a Read-Only Administrator", detail: "Okta Admin → Security → Administrators → Add administrator (ideally a dedicated service user). Assign the built-in Read-Only Administrator role — least privilege that still reads users, applications, and policies (everything Neo's checks need)." },
      { title: "Create the API token as that admin", detail: "Signed in as the read-only admin: Security → API → Tokens → Create Token. The SSWS token inherits that admin's permissions (read-only). Copy it (shown once)." },
      { title: "Enter your org URL + token", detail: "Org URL is https://your-org.okta.com (no trailing slash). Neo sends the token as an SSWS header — revoke it from Okta any time." },
    ],
  },
  async preflight(client) {
    return [await reachable(client, "/api/v1/users?limit=1", "API token valid")];
  },
  capabilities: [
    {
      capabilityId: "mfa_enforced",
      label: "MFA enrollment policy active",
      unlocksControls: ["identity-and-access", "authentication"],
      freshnessHours: 168,
      run: (client) => guarded(async () => {
        const res = await client.request("/api/v1/policies?type=MFA_ENROLL");
        const policies = ((await res.json().catch(() => [])) as { status?: string }[]) ?? [];
        const active = policies.filter((p) => p.status === "ACTIVE");
        return active.length > 0
          ? pass(`${active.length} active MFA enrollment policy.`, { activePolicies: active.length })
          : fail("No active MFA enrollment policy.", "Activate an MFA enrollment policy in Okta (Security → Authenticators / Policies).");
      }),
    },
    {
      // SSO app inventory — what Okta brokers access to (Pillar 1). One org-read token covers it.
      capabilityId: "sso_app_inventory",
      label: "SSO application inventory",
      unlocksControls: ["inventory", "identity-and-access"],
      freshnessHours: 168,
      run: (client) => guarded(async () => {
        const res = await client.request(`/api/v1/apps?filter=${encodeURIComponent('status eq "ACTIVE"')}&limit=200`);
        const apps = ((await res.json().catch(() => [])) as { label?: string }[]) ?? [];
        return apps.length > 0
          ? pass(`${apps.length} active SSO application(s) integrated in Okta.`, { activeApps: apps.length })
          : fail("No active SSO applications returned.", "Confirm the API token has okta.apps.read.");
      }),
    },
  ],
};

export const entraRecipe: ProviderRecipe = {
  id: "entra",
  name: "Entra ID",
  category: "Identity",
  accent: "#0078d4",
  maturity: "verified",
  summary: "Confirm MFA is enforced — via Conditional Access or Security Defaults.",
  auth: {
    method: "oauth2_client_credentials",
    broker: "native",
    scopes: ["Policy.Read.All", "Organization.Read.All"],
    scope: "https://graph.microsoft.com/.default",
    baseUrlTemplate: "https://graph.microsoft.com/v1.0",
    tokenUrlTemplate: "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token",
    fields: [
      { key: "tenantId", label: "Tenant ID" },
      { key: "clientId", label: "App (client) ID" },
      { key: "clientSecret", label: "Client secret", secret: true },
    ],
    setup: [
      { title: "Register an app with Policy.Read.All", detail: "Entra admin → App registrations → New. Grant application permission Policy.Read.All + Organization.Read.All (admin consent)." },
      { title: "Add a client secret", detail: "Certificates & secrets → New client secret. Paste tenant id, client id, secret." },
    ],
  },
  async preflight(client) {
    return [await reachable(client, "/organization", "Graph token + org read")];
  },
  capabilities: [
    {
      capabilityId: "mfa_enforced",
      label: "MFA enforced (Conditional Access or Security Defaults)",
      unlocksControls: ["identity-and-access", "authentication"],
      freshnessHours: 168,
      run: (client) => guarded(async () => {
        const res = await client.request("/identity/conditionalAccess/policies");
        const j = await safeJson(res);
        const pols = (j?.value as { state?: string; grantControls?: { builtInControls?: string[] } }[]) ?? [];
        const mfa = pols.filter((p) => p.state === "enabled" && (p.grantControls?.builtInControls ?? []).includes("mfa"));
        if (mfa.length > 0) return pass(`${mfa.length} enabled Conditional Access policy requiring MFA.`, { conditionalAccessPolicies: mfa.length });

        // many tenants enforce MFA via Security Defaults rather than CA (esp. without Entra ID P1)
        const sd = await client.request("/policies/identitySecurityDefaultsEnforcementPolicy");
        const sdj = await safeJson(sd);
        if (sdj?.isEnabled === true) return pass("Security Defaults are enabled — MFA is enforced for all users.", { securityDefaults: true });

        return fail(
          "MFA isn't enforced — no Conditional Access policy requires it, and Security Defaults are off.",
          "Turn on Security Defaults (Entra → Overview → Properties → Manage security defaults), or create a Conditional Access policy requiring MFA (needs Entra ID P1).",
        );
      }),
    },
  ],
};

export const googleWorkspaceRecipe: ProviderRecipe = {
  id: "google_workspace",
  name: "Google Workspace",
  category: "Identity",
  accent: "#ea4335",
  maturity: "authored_untested",
  summary: "Confirm users are enrolled in 2-step verification.",
  auth: {
    method: "gcp_service_account",
    broker: "native",
    scopes: ["https://www.googleapis.com/auth/admin.directory.user.readonly"],
    scope: "https://www.googleapis.com/auth/admin.directory.user.readonly",
    baseUrlTemplate: "https://admin.googleapis.com",
    fields: [
      { key: "clientEmail", label: "Service account email", help: "From the SA JSON key (client_email)." },
      { key: "privateKey", label: "Service account private key", secret: true, help: "The private_key value from the SA JSON key (the BEGIN…END block)." },
      { key: "subject", label: "Admin email to impersonate", placeholder: "admin@acme.com", help: "A super-admin the read-only SA acts as.", optional: true },
      { key: "customerId", label: "Customer ID", placeholder: "my_customer", help: "Usually 'my_customer'.", optional: true },
    ],
    setup: [
      { title: "Create a service account + JSON key", detail: "Google Cloud Console → IAM & Admin → Service Accounts → Create. Add a key (JSON) and download it." },
      { title: "Enable domain-wide delegation", detail: "On that service account, turn on domain-wide delegation and copy its Client ID (a long number)." },
      { title: "Authorize the scope in Admin Console", detail: "Google Admin Console → Security → API controls → Domain-wide delegation → Add new. Paste the Client ID and the scope https://www.googleapis.com/auth/admin.directory.user.readonly." },
      { title: "Enter the fields below", detail: "SA email + private key (from the JSON), an admin email to impersonate, and customer id (usually my_customer)." },
    ],
  },
  async preflight(client, cred) {
    const customer = String(cred.customerId ?? "my_customer");
    return [await reachable(client, `/admin/directory/v1/users?customer=${customer}&maxResults=1`, "Delegated SA + directory read")];
  },
  capabilities: [
    {
      capabilityId: "mfa_enforced",
      label: "Users enrolled in 2-step verification",
      unlocksControls: ["identity-and-access", "authentication"],
      freshnessHours: 168,
      run: (client, cred) => guarded(async () => {
        const customer = String(cred.customerId ?? "my_customer");
        const res = await client.request(`/admin/directory/v1/users?customer=${customer}&maxResults=100&projection=full`);
        const j = await safeJson(res);
        const users = (j?.users as { isEnrolledIn2Sv?: boolean; suspended?: boolean }[]) ?? [];
        const active = users.filter((u) => !u.suspended);
        if (active.length === 0) return fail("No active users returned.", "Check delegation scope and admin subject.");
        const notEnrolled = active.filter((u) => !u.isEnrolledIn2Sv).length;
        return notEnrolled === 0
          ? pass(`All ${active.length} sampled users enrolled in 2SV.`, { sampled: active.length })
          : fail(`${notEnrolled}/${active.length} sampled users not enrolled in 2SV.`, "Enforce 2-step verification for all users (Admin → Security → 2SV).");
      }),
    },
  ],
};

export const identityRecipes = [oktaRecipe, entraRecipe, googleWorkspaceRecipe];
