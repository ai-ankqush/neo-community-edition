import { planFor } from "@/lib/plans";

/**
 * Who can see AI Supply Chain Control. Available on Starter, Enterprise and
 * Founding Reviewer plans, and always on for demo orgs. Practitioner / Trial do
 * NOT see it (it's a Starter+ capability).
 *
 * Use this single helper everywhere the feature is surfaced (the page gate, the
 * sidebar, the dashboard, reports, and the executive summary) so entitlement
 * never drifts between surfaces.
 */
export function canSupplyChain(plan: string | null | undefined, isDemo: boolean): boolean {
  return isDemo || planFor(plan).supplyChain;
}
