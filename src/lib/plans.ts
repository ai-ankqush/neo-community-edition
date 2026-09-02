/** Plan definitions - limits AND feature flags, enforced server-side.
 *
 * Pricing model (Jun 2026): EVERY AI analysis feature is available on every paid
 * plan — Assessments, Supply Chain + AI-BOM, AI Control Graph, Red Team, Vendor
 * Review, Integrations, code generation, all crosswalks. Plans differ by SCALE
 * (active use-case count + token/regen backstops), not by feature. The only
 * feature gates left are the enterprise-ops tier: SSO, multi-workspace, advanced
 * /executive reporting, and live verification (Enterprise). AI Action Fabric is
 * a separate private preview, gated outside this file (is_demo).
 *
 * The use-case cap is PER ACCOUNT (active, non-archived use cases under
 * governance), not a monthly quota. `useCasesActive` is the ceiling.
 */

export interface PlanDef {
  key: string;
  label: string;
  priceMonthly: number | null; // null = quoted
  blurb: string;
  // limits
  useCasesActive: number;       // max ACTIVE (non-archived) use cases per account
  tokensPerMonth: number;
  regenPerStage: number;
  techProductLimit: number; // max products in the stack picker; Infinity = unlimited
  vendorReviewsActive: number;  // max ACTIVE vendor AI reviews; own quota, separate from use cases
  // features
  stackAwareControls: boolean;  // false = generic controls (no stack mapping)
  allCrosswalks: boolean;       // false = NIST AI RMF only
  decisionBoard: "view" | "basic" | "full";
  verificationManual: boolean;  // manual control attestation
  verificationLive: boolean;    // live connector checks (Enterprise)
  codeGeneration: boolean;      // generated code artifacts (Starter+)
  advancedReporting: boolean;   // portfolio reporting & exports (Enterprise)
  multiWorkspace: boolean;      // isolated workspace per client (Enterprise)
  sso: boolean;                 // enterprise SSO (Enterprise)
  redTeam: boolean;             // Red Team attack-path analysis (Enterprise)
  vendorReview: boolean;        // Vendor AI Review — pre-purchase product assessment (Enterprise + Reviewer)
  integrations: boolean;        // Connected verification / connectors (Starter+; not Practitioner)
  supplyChain: boolean;         // AI Supply Chain Control — dependency authority graph, AI-BOM, DD reports (Starter+)
  managedModelKey: boolean;     // true = runs on Neo's managed model key (paid); false = customer must bring their own key (Community)
}

/** Length of the free trial, in days. */
export const TRIAL_DAYS = 14;

export const PLANS: Record<string, PlanDef> = {
  trial: {
    key: "trial",
    label: "Free trial",
    priceMonthly: 0,
    blurb: "14-day full-feature trial. Assess two AI use cases end to end, no card required.",
    useCasesActive: 2,
    tokensPerMonth: 2_000_000,
    regenPerStage: 5,
    techProductLimit: Infinity,
    vendorReviewsActive: 1,
    // full-feature taste during the trial
    stackAwareControls: true,
    allCrosswalks: true,
    decisionBoard: "full",
    verificationManual: true,
    verificationLive: false,
    codeGeneration: true,
    advancedReporting: true,
    multiWorkspace: false,
    sso: false,
    redTeam: true,
    vendorReview: true,
    integrations: true,
    supplyChain: true,
    managedModelKey: true,
  },
  // Practitioner: the individual / solo-practitioner tier. The full feature set
  // (every AI analysis capability), scaled down — 3 active use cases and one run
  // per use case (regenPerStage: 1) keeps token cost bounded. The enterprise-ops
  // tier (SSO, multi-workspace, advanced/exec reporting, live verification) is
  // the Enterprise upsell.
  practitioner: {
    key: "practitioner",
    label: "Practitioner",
    priceMonthly: 29.99,
    blurb: "For the individual practitioner. The full platform — assessments, AI Control Graph, Supply Chain + AI-BOM, Red Team, vendor risk, integrations, and code generation — for up to 3 active use cases.",
    useCasesActive: 3,
    tokensPerMonth: 3_000_000,
    regenPerStage: 1,
    techProductLimit: Infinity,
    vendorReviewsActive: 3,
    stackAwareControls: true,
    allCrosswalks: true,
    decisionBoard: "full",
    verificationManual: true,
    verificationLive: false,
    codeGeneration: true,
    advancedReporting: false,   // advanced/exec reporting is the Enterprise upsell
    multiWorkspace: false,
    sso: false,                 // SSO is Enterprise
    redTeam: true,
    vendorReview: true,
    integrations: true,
    supplyChain: true,
    managedModelKey: true,
  },
  starter: {
    key: "starter",
    label: "Starter",
    priceMonthly: 1500,
    blurb: "The full platform for a focused AI portfolio. Assess, control, prove, decide, and ship the code.",
    useCasesActive: 10,
    tokensPerMonth: 8_000_000,
    regenPerStage: 5,
    techProductLimit: Infinity,
    vendorReviewsActive: 10,
    stackAwareControls: true,
    allCrosswalks: true,
    decisionBoard: "full",
    verificationManual: true,
    verificationLive: false,
    codeGeneration: true,
    advancedReporting: false,   // advanced/exec reporting is the Enterprise upsell
    multiWorkspace: false,
    sso: false,
    redTeam: true,
    vendorReview: true,   // included on Starter (Practitioner has it too — keep the ladder monotonic)
    integrations: true,
    supplyChain: true,    // AI Supply Chain Control — Starter and up
    managedModelKey: true,
  },
  enterprise: {
    key: "enterprise",
    label: "Enterprise",
    priceMonthly: null, // custom quote
    blurb: "Everything in Starter plus SSO, multiple workspaces, advanced reporting, live verification, and a named contact.",
    useCasesActive: Infinity,
    tokensPerMonth: Infinity,
    regenPerStage: 10,
    techProductLimit: Infinity,
    vendorReviewsActive: Infinity,
    stackAwareControls: true,
    allCrosswalks: true,
    decisionBoard: "full",
    verificationManual: true,
    verificationLive: false, // roadmap — not shipped; keep UI honest
    codeGeneration: true,
    advancedReporting: true,
    multiWorkspace: true,
    sso: true,
    redTeam: true,
    vendorReview: true,
    integrations: true,
    supplyChain: true,
    managedModelKey: true,
  },
  // Founding Reviewer comp: full Enterprise-grade experience, but with a soft
  // cap (10 active use cases), a token backstop, and tighter regen limits so a
  // 30-day free tester can't run up the bill. Single workspace keeps the cap
  // meaningful (multi-workspace would let one reviewer multiply the cap).
  reviewer: {
    key: "reviewer",
    label: "Founding Reviewer",
    priceMonthly: 0,
    blurb: "Full Enterprise-grade access for the 30-day Founding Reviewer program. Every feature, capped at 10 active use cases.",
    useCasesActive: 10,
    tokensPerMonth: 20_000_000,
    regenPerStage: 3,
    techProductLimit: Infinity,
    vendorReviewsActive: 5,
    stackAwareControls: true,
    allCrosswalks: true,
    decisionBoard: "full",
    verificationManual: true,
    verificationLive: false,
    codeGeneration: true,
    advancedReporting: true,
    multiWorkspace: false,
    sso: true,
    redTeam: true,
    vendorReview: true,
    integrations: true,
    supplyChain: true,
    managedModelKey: true,
  },
  // Community: the free, self-serve tier. Runs on the customer's OWN model key
  // (Anthropic / Bedrock / Vertex) — usage bills to them, not Neo — so hosting
  // is our only cost. The assessment taste is unlocked (classify, tier,
  // stack-aware controls with manual attestation, red team, all crosswalks);
  // the premium surfaces (Supply Chain, Vendor Review, Integrations/live
  // verification, decisions, code generation, reporting, SSO) are locked as
  // upsell. Capped at 1 active use case. managedModelKey:false = BYO key required.
  community: {
    key: "community",
    label: "Community",
    priceMonthly: 0,
    blurb: "Free and self-serve, on your own model key. Classify, risk-tier, control, and red-team your AI use cases — bring your own Anthropic, Bedrock, or Vertex key.",
    useCasesActive: Infinity, // open-source, self-hosted, BYO key — no cap
    tokensPerMonth: Infinity, // customer pays their own tokens via their key
    regenPerStage: 25, // generous — the customer pays for their own tokens, so no Neo-cost reason to cap tightly
    techProductLimit: Infinity,
    vendorReviewsActive: 0,
    stackAwareControls: true, // stack-aware controls are core to the taste
    allCrosswalks: true,
    decisionBoard: "view",    // decisions are locked (read-only)
    verificationManual: true, // manual met / partial / not-met attestation
    verificationLive: true,   // read-only connected verification via the integration fabric
    codeGeneration: false,
    advancedReporting: false,
    multiWorkspace: false,
    sso: false,
    redTeam: true,
    vendorReview: false,
    integrations: true,       // recipe-driven read-only connectors
    supplyChain: false,
    managedModelKey: false,
  },
};

export function planFor(plan: string | null | undefined): PlanDef {
  // legacy 'free' -> trial; legacy 'premium' -> the new single paid tier (starter)
  if (!plan || plan === "free") return PLANS.trial;
  if (plan === "premium") return PLANS.starter;
  return PLANS[plan] ?? PLANS.trial;
}

/** Per-org entitlement overrides a super-admin can set (caps + feature toggles). Stored on
 *  organizations.entitlement_overrides (jsonb); only keys present here override the plan default. */
export type EntitlementOverrides = Partial<
  Pick<
    PlanDef,
    | "useCasesActive"
    | "vendorReviewsActive"
    | "redTeam"
    | "vendorReview"
    | "integrations"
    | "supplyChain"
    | "codeGeneration"
    | "verificationLive"
    | "advancedReporting"
    | "sso"
    | "multiWorkspace"
  >
>;

export const OVERRIDABLE_KEYS: (keyof EntitlementOverrides)[] = [
  "useCasesActive",
  "vendorReviewsActive",
  "redTeam",
  "vendorReview",
  "integrations",
  "supplyChain",
  "codeGeneration",
  "verificationLive",
  "advancedReporting",
  "sso",
  "multiWorkspace",
];

/** Plan defaults with a specific org's overrides applied. This is the resolver gates should use
 *  instead of planFor() when a per-customer override should take effect. */
export function entitlementsFor(
  plan: string | null | undefined,
  overrides?: EntitlementOverrides | null
): PlanDef {
  const base = planFor(plan);
  if (!overrides || typeof overrides !== "object") return base;
  const out: PlanDef = { ...base };
  for (const k of OVERRIDABLE_KEYS) {
    const v = overrides[k];
    if (v !== undefined && v !== null) (out as unknown as Record<string, unknown>)[k] = v;
  }
  return out;
}

export function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

/**
 * Is this org on a PAID plan (anything that isn't the free trial)? Used to gate paid-only surfaces such as
 * the PAL finding reveal — the full attack method is for paying accounts, not trials. planFor already folds
 * legacy 'free' → trial and 'premium' → starter, so any resolved key other than 'trial' is a paying tier.
 */
export function isPaidPlan(plan: string | null | undefined): boolean {
  const k = planFor(plan).key;
  return k !== "trial" && k !== "community"; // trial and community are free tiers
}

/** AI Action Fabric — SHIPPED to every org (interface reworked Aug 2026; the UI was the
 *  reason it was held back). Available on all plans. Demo orgs additionally get live
 *  enforcement (`enforcementEnabled = isDemo` in layout / action-control); everyone else
 *  runs it in shadow/observe and carries a "Beta" tag (`afBeta = showAF && !isDemo`).
 *  To re-gate, restore: `return isDemo;` (demo-only) or `return isDemo || planFor(_plan).sso;` (Enterprise). */
export function canActionFabric(_plan?: string | null, _isDemo?: boolean): boolean {
  return true; // ungated: the Action Fabric is available to every organization.
}

/** Enforcement (the PEP actually BLOCKING live actions) is EARNED and PAYWALLED — never
 *  just applied. This function is the paywall half: only paid plans (or internal/demo) may
 *  enforce at all, so free/trial orgs watch and learn in shadow and understand the weight
 *  before they buy. The "earned" half is enforced elsewhere: an integration must GRADUATE
 *  (a proven shadow soak — see readiness()/graduationGate()) before it can move to
 *  Approve/Block, except on a use case explicitly marked a TEST environment (the
 *  acknowledged fast-path for experimentation). Kill-switch reverts everything, always. */
export function canEnforce(plan: string | null | undefined, isDemo: boolean): boolean {
  return isDemo || isPaidPlan(plan);
}
