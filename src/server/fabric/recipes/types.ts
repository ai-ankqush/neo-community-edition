/** Neo Connection Manager — recipe-driven integration framework.
 *  A provider is a declarative ProviderRecipe (data + small check fns), not a
 *  bespoke connector. See ops-pack agent-knowledge/17 + memory connection-manager-architecture. */

import type { CheckResult } from "../types";

export type AuthMethod =
  | "api_token"               // static token / key (Okta SSWS, Jira email+token)
  | "oauth2_client_credentials" // machine-to-machine (CrowdStrike, ServiceNow, Azure, Entra)
  | "gcp_service_account"     // SA key → signed JWT → token (GCP, Google Workspace)
  | "aws_role";               // STS assume-role + external id (AWS)

/** A field the user supplies when connecting (stored in org_connections.credential). */
export interface CredentialField {
  key: string;
  label: string;
  placeholder?: string;
  secret?: boolean;   // mask in UI; encrypt-at-rest note applies
  help?: string;
  optional?: boolean; // when true, may be left blank (e.g. region defaults, SA impersonation subject).
                      // ALL other fields are required — a placeholder is a hint, never a default.
}

export interface SetupStep {
  title: string;
  detail: string;
  link?: string;
}

/** An authed HTTP client the auth layer builds from a connection's credential.
 *  Check + preflight fns talk only to this — never to a vendor SDK. */
export interface ProviderClient {
  baseUrl: string;
  request(path: string, init?: RequestInit): Promise<Response>;
}

export type ReadinessState = "ready" | "needs_scope" | "unreachable" | "auth_failed";

export interface PreflightResult {
  id: string;
  label: string;
  state: ReadinessState;
  detail?: string;
}

/** One capability the recipe can verify, and how. cred = the connection's stored
 *  fields (region, projectId, instance, …); params = per-use-case overrides. */
export interface RecipeCapability {
  capabilityId: string;
  label: string;
  unlocksControls: string[];   // control keys this evidence supports
  freshnessHours: number;
  run(client: ProviderClient, cred: Record<string, unknown>, params: Record<string, unknown>): Promise<CheckResult>;
}

export type RecipeMaturity = "verified" | "authored_untested";

export interface ProviderRecipe {
  id: string;                  // provider key, matches org_connections.provider
  name: string;
  category: string;
  accent: string;
  maturity: RecipeMaturity;
  summary: string;
  auth: {
    method: AuthMethod;
    broker: "native" | "nango"; // native by default; Nango reserved/optional
    scopes: string[];
    fields: CredentialField[];
    setup: SetupStep[];
    /** Templates with {field} placeholders filled from the stored credential,
     *  so per-tenant URLs don't have to be typed by the user. */
    baseUrlTemplate?: string;   // e.g. "https://{instance}.service-now.com"
    tokenUrlTemplate?: string;  // e.g. "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token"
    scope?: string;
    /** Fixed credential values always stored on connect (e.g. an auth scheme the
     *  user shouldn't have to type). User-entered fields override these. */
    defaults?: Record<string, string>;
  };
  trustTemplate?: { iac: "terraform" | "cloudformation" | "bicep"; filename: string; note: string };
  /** Lightweight connection-time checks: auth works? scopes ok? API reachable? */
  preflight(client: ProviderClient, cred: Record<string, unknown>): Promise<PreflightResult[]>;
  capabilities: RecipeCapability[];
}
