/** Risk appetite → coverage colour.
 *
 *  The org sets an acceptable control-coverage target per risk tier (its appetite). The
 *  advanced-dashboard coverage bar then colours RELATIVE to that target rather than a fixed
 *  scale — so the same 80% is a pass for one business and a fail for another.
 *
 *  "Criticality-weighted" without a per-control criticality field: coverage is weighted by
 *  control STATUS (in place = 1, partial = 0.5, gap = 0, n/a excluded), and the use-case TIER
 *  is the criticality signal — a Tier 4-5 use case with an outright gap cannot go green even
 *  if the percentage clears, because a high-risk use case shouldn't have a missing control. */

export type TierTargets = Record<string, number>; // "1".."5" -> acceptable coverage %

export const DEFAULT_TIER_TARGETS: TierTargets = { "1": 50, "2": 65, "3": 80, "4": 90, "5": 95 };

/** Read a target %, tolerant of a missing/partial config. */
export function targetForTier(targets: TierTargets | null | undefined, tier: number | null | undefined): number {
  const key = String(tier ?? 2);
  const t = targets?.[key];
  return typeof t === "number" && t >= 0 && t <= 100 ? t : (DEFAULT_TIER_TARGETS[key] ?? 80);
}

/** Merge a stored config over the defaults + clamp — safe to feed the editor or the bar. */
export function normalizeTargets(raw: unknown): TierTargets {
  const out: TierTargets = { ...DEFAULT_TIER_TARGETS };
  if (raw && typeof raw === "object") {
    for (const k of ["1", "2", "3", "4", "5"]) {
      const v = (raw as Record<string, unknown>)[k];
      if (typeof v === "number" && v >= 0 && v <= 100) out[k] = Math.round(v);
    }
  }
  return out;
}

export interface ControlLike { status: string } // "gap" | "partial" | "in_place" | "n/a"

/** Weighted coverage over a use case's assigned controls. */
export function weightedCoverage(controls: ControlLike[]): { pct: number; required: number; hasGap: boolean } {
  const applicable = controls.filter((c) => c.status !== "n/a");
  const required = applicable.length;
  if (required === 0) return { pct: 100, required: 0, hasGap: false };
  const score = applicable.reduce(
    (s, c) => s + (c.status === "in_place" ? 1 : c.status === "partial" ? 0.5 : 0),
    0,
  );
  return {
    pct: Math.round((score / required) * 100),
    required,
    hasGap: applicable.some((c) => c.status === "gap"),
  };
}

export type Band = "red" | "amber" | "green" | "blue";

const BAND_COLOR: Record<Band, string> = { red: "#dc2626", amber: "#d97706", green: "#16a34a", blue: "#2563eb" };

export interface CoverageStatus {
  band: Band;
  color: string;
  label: string;
  target: number;      // the appetite for this tier
  met: boolean;        // appetite satisfied (green or blue)
}

/** Colour band for one use case, given its weighted coverage %, tier, the org's targets,
 *  and whether an outright gap remains. */
export function coverageStatus(
  pct: number,
  tier: number | null | undefined,
  targets: TierTargets | null | undefined,
  hasGap: boolean,
): CoverageStatus {
  const target = targetForTier(targets, tier);
  const floor = Math.max(0, target - 20);        // "approaching" starts 20 points below target
  const highTier = (tier ?? 2) >= 4;             // Tier 4-5: an outright gap blocks green
  const gapBlocksGreen = highTier && hasGap;

  let band: Band;
  if (pct >= 100 && !hasGap) band = "blue";                       // full, proven coverage
  else if (pct >= target && !gapBlocksGreen) band = "green";      // meets the business's appetite
  else if (pct >= floor && !gapBlocksGreen) band = "amber";       // approaching
  else band = pct >= floor ? "amber" : "red";                     // high-tier gap can't be green, still amber unless below floor

  const label =
    band === "blue" ? "Full coverage"
    : band === "green" ? "Meets your risk appetite"
    : band === "amber" ? (gapBlocksGreen ? "A critical gap remains" : "Below your target")
    : "Well below your target";

  return { band, color: BAND_COLOR[band], label, target, met: band === "green" || band === "blue" };
}
