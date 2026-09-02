import "server-only";
import Stripe from "stripe";

/** True when Stripe is configured on this deployment. White-label stacks that bill their own
 *  customers won't set STRIPE_SECRET_KEY — and a missing key must NOT crash the app. */
export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

let _stripe: Stripe | null = null;
/** Lazily-created Stripe client. `new Stripe("")` throws at construction, so we never build it
 *  at import time (which would crash any deployment without a key) — only on first real use,
 *  after a stripeConfigured() guard in the route. */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe is not configured on this deployment (no STRIPE_SECRET_KEY).");
  if (!_stripe) _stripe = new Stripe(key);
  return _stripe;
}

export type PaidPlan = "practitioner" | "starter";
export type Cadence = "monthly" | "annual";

/** Price IDs come from env so the same code runs in test and live. */
export const PRICE_IDS: Record<PaidPlan, Record<Cadence, string>> = {
  practitioner: {
    monthly: process.env.STRIPE_PRICE_PRACTITIONER_MONTHLY ?? "",
    annual: process.env.STRIPE_PRICE_PRACTITIONER_ANNUAL ?? "",
  },
  starter: {
    monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY ?? "",
    annual: process.env.STRIPE_PRICE_STARTER_ANNUAL ?? "",
  },
};

export function priceFor(plan: PaidPlan, cadence: Cadence): string {
  return PRICE_IDS[plan][cadence];
}

/** Reverse-map a Stripe price id back to our plan + cadence (for the webhook). */
export function planForPrice(priceId: string): { plan: PaidPlan; cadence: Cadence } | null {
  for (const plan of ["practitioner", "starter"] as PaidPlan[]) {
    for (const cadence of ["monthly", "annual"] as Cadence[]) {
      if (PRICE_IDS[plan][cadence] && PRICE_IDS[plan][cadence] === priceId) {
        return { plan, cadence };
      }
    }
  }
  return null;
}
