/**
 * White-label brand config — one codebase, per-deployment brand via env.
 * Defaults to Neo. Partner stacks (a rebranded deployment) set these in their Vercel env:
 *   NEXT_PUBLIC_BRAND_NAME=Acme Security
 *   NEXT_PUBLIC_BRAND_TAGLINE=AI Governance        (set empty to hide the tagline)
 *   NEXT_PUBLIC_BRAND_CONTACT=hello@example.com
 *   NEXT_PUBLIC_PRICING_MODE=on-request            (hides $ prices; everything but the trial = "On request")
 * These are NEXT_PUBLIC_ so they're available in client and server components.
 */
export const BRAND = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME || "Neo",
  tagline: process.env.NEXT_PUBLIC_BRAND_TAGLINE ?? "AI Control Architecture",
  contactEmail: process.env.NEXT_PUBLIC_BRAND_CONTACT || "neo@neocontrol.ai",
  logoUrl: process.env.NEXT_PUBLIC_BRAND_LOGO_URL || "/neo-logo.png",
  // Full horizontal lockup (with name) for large placements like the sign-in page. Falls back to the icon.
  wordmarkUrl: process.env.NEXT_PUBLIC_BRAND_WORDMARK_URL || process.env.NEXT_PUBLIC_BRAND_LOGO_URL || "/neo-logo.png",
  faviconUrl:
    process.env.NEXT_PUBLIC_BRAND_FAVICON || process.env.NEXT_PUBLIC_BRAND_LOGO_URL || "/neo-logo.png",
  pricingMode: (process.env.NEXT_PUBLIC_PRICING_MODE || "public") as "public" | "on-request",
  theme: (process.env.NEXT_PUBLIC_BRAND_THEME === "light" ? "light" : "dark") as "light" | "dark",
};

/** True when this deployment hides public prices (white-label / India pricing on request). */
export const onRequestPricing = BRAND.pricingMode === "on-request";
