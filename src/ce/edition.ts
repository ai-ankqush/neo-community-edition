/**
 * Edition flag for Neo Community Edition.
 *
 * The same product, gated down. When NEO_EDITION=community, the five paid modules
 * are hidden from the nav and blocked at the route/API layer. Default (unset) is
 * the full enterprise product, so production is completely unchanged.
 *
 * This is deliberately tiny and pure (only reads an env var) so it can be imported
 * from server components, client components, and the edge middleware alike.
 */
import { AUTH_PROVIDER } from "./auth-provider";

export const EDITION: "community" | "enterprise" =
  process.env.NEO_EDITION === "community" ? "community" : "enterprise";

/**
 * Deployment-wide community edition (whole app). True when NEO_EDITION=community,
 * OR when the deployment runs built-in auth (AUTH_PROVIDER=builtin) — a built-in
 * deployment IS Community Edition, so it also gets the paid-module strip. Default
 * (Clerk + no NEO_EDITION) stays the full enterprise product.
 */
export const isCommunity = (): boolean => EDITION === "community" || AUTH_PROVIDER === "builtin";

/**
 * Per-viewer community PREVIEW, via a cookie — so the same production deployment
 * (same DB, same env) can show the cut-down edition at /neo-ce-gated without a
 * separate project. No cookie = full product, unchanged.
 */
export const EDITION_COOKIE = "neo_edition";
export const isCommunityCookie = (v?: string | null): boolean => v === "community";

/** Page routes hidden + redirected in the Community Edition (the paid five). */
// Red Team stays in Community Edition (it just runs adversarial use cases), so it
// is intentionally NOT blocked here — only surfaced with an Anthropic-approval caveat.
export const COMMUNITY_BLOCKED_PAGES: string[] = [
  "/dashboard/supply-chain",
  "/dashboard/ai-bom",
  "/dashboard/vendor-reviews",
  "/dashboard/action-control",
  "/dashboard/control-graph/shadow-ai",
  // Hosted-SaaS / Clerk surfaces that have no place in a self-hosted edition:
  "/dashboard/new-organization", // Clerk create-org (Sky org switcher replaces it)
  "/sign-in",                    // Clerk auth pages (CE uses /sky/login + /sky/signup)
  "/sign-up",
  "/vendor-portal",              // Vendor Review paid-module answer portal
];

/** API routes 404'd in the Community Edition, so a hidden module can't be driven. */
export const COMMUNITY_BLOCKED_APIS: string[] = [
  "/api/supply-chain",
  "/api/vendor-reviews",
  "/api/action-fabric",
  "/api/shadow-ai",
  // Hosted-SaaS billing / marketplace / Clerk endpoints — inert without keys, but
  // shouldn't be reachable in a free self-host:
  "/api/billing",                // Stripe (checkout, webhook, portal, redeem, select/try-plan)
  "/api/marketplace",            // AWS Marketplace subscription fulfillment
  "/api/vendor-portal",          // Vendor Review token portal
  "/api/founding",               // hosted founding-cohort program
  "/api/clerk",                  // Clerk webhook
];

export const isBlockedPage = (path: string): boolean => COMMUNITY_BLOCKED_PAGES.some((b) => path === b || path.startsWith(b + "/"));
export const isBlockedApi = (path: string): boolean => COMMUNITY_BLOCKED_APIS.some((b) => path === b || path.startsWith(b + "/"));
