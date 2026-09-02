/**
 * Which identity backend the host session uses.
 *   clerk   (default) — today's behaviour; Neo's hosted app is unchanged.
 *   builtin           — Neo-native Sky auth (password / magic-link), for Community Edition.
 *   oidc              — reserved: the customer's own SSO (already handled per-request by the
 *                       bearer-token path in resolvePrincipal).
 *
 * Default is `clerk`, so production is untouched unless AUTH_PROVIDER is set.
 */
export const AUTH_PROVIDER: "clerk" | "builtin" =
  process.env.AUTH_PROVIDER === "builtin" ? "builtin" : "clerk";
