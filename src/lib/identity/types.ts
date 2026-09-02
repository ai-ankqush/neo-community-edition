/**
 * The Identity port — Neo Gravity's vendor-independent identity primitive.
 *
 * Gravity depends on this INTERFACE, never on an auth vendor directly. Every identity provider
 * (Clerk today; customer OIDC/SSO in Phase 2 — Neo Sky) is an adapter behind this port, selected in
 * exactly one place (`lib/identity/index.ts`). The fixed layer needs only one fact from auth:
 * *this request belongs to tenant T, subject S*. Everything else — roles, access policy — is resolved
 * above this (platform RBAC now; authored authn/z in Sky later).
 *
 * If the auth vendor disappears, we swap the adapter, not the platform.
 */
export interface Identity {
  /** Subject S — the authenticated user, stable within the active provider. Null when not signed in. */
  subjectId: string | null;
  /** Tenant T — the external org/tenant id from the provider. Null when no tenant is selected. */
  tenantExternalId: string | null;
  /** The provider's coarse tenant role (e.g. Clerk "org:admin"). Platform roles are resolved in rbac. */
  tenantRole: string | null;
}

export interface IdentityAdapter {
  /** Resolve the current request's identity from this provider. */
  getIdentity(): Promise<Identity>;
}
