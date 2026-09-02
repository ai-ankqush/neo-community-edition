import "server-only";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * THE LEARNING LOOP — where Neo stops asserting how sure it is and starts KNOWING.
 *
 * Every confidence Neo has stated so far is a PRIOR: reasoned, defensible, but unearned. This
 * module closes the loop. It reads what actually happened to Neo's settled predictions and
 * re-derives the confidence it should have used, per (kind × prior band). Next time Neo makes that
 * kind of claim at that strength, it speaks with a number the world gave it, not one I typed.
 *
 * This is the whole difference between intelligence and scripting. A script states 85% forever. An
 * intelligence notices it was only right 61% of the time when it said 85%, and quietly starts
 * saying 61% — and, crucially, can be checked doing it.
 *
 * FOUR RULES THAT KEEP IT HONEST
 *
 * 1. LAPLACE SMOOTHING, NOT RAW RATES. With 3 resolutions you'd get 100% or 0% — nonsense that
 *    would swing Neo's voice wildly. (correct + α·prior) / (n + α) starts AT the prior and moves
 *    toward the evidence only as fast as the evidence accumulates.
 *
 * 2. NEVER LEARN FROM HUMAN AGREEMENT. Only predictions resolved by `verification`, `redteam_run`
 *    or `clock` count — events the world produced. If Neo learned from humans agreeing with it,
 *    it would learn to say what people want to hear, which is the failure mode this entire feature
 *    exists to prevent. `resolved_by = 'human'` is excluded here on purpose.
 *
 * 3. IT MAY MOVE NEO DOWN OR UP, BUT NEVER PAST THE FLOOR. A learned confidence is clamped to
 *    [0.15, 0.95]. Neo never becomes certain, and never becomes so timid it stops speaking.
 *
 * 4. IT IS INSPECTABLE. The scorecard shows the prior, the learned value, and the n behind it.
 *    A model that adjusts itself in ways nobody can audit is not trustworthy, however good it gets.
 */

/** Weight of the prior, in units of "pretend observations". Higher = slower, steadier learning. */
const ALPHA = 8;
const MIN_N_TO_ADJUST = 5;   // below this, the prior stands unmodified
const FLOOR = 0.15;
const CEIL = 0.95;

export interface LearnedRate {
  kind: string;
  band: string;          // the prior band this was learned for
  prior: number;         // what Neo used to say
  learned: number;       // what the evidence says it should say
  n: number;             // how many settled predictions back this
  correct: number;
}

/** Which prior band does a stated confidence fall in? Coarse on purpose — fine bands starve. */
export function bandOf(confidence: number): string {
  if (confidence < 0.5) return "lt50";
  if (confidence < 0.65) return "50-65";
  if (confidence < 0.8) return "65-80";
  if (confidence < 0.9) return "80-90";
  return "90-100";
}

/**
 * Read the org's settled predictions and derive what Neo *should* be saying.
 * Returns a lookup keyed `${kind}:${band}`.
 */
export async function learnRates(orgId: string): Promise<Map<string, LearnedRate>> {
  const { data } = await supabaseAdmin()
    .from("predictions")
    .select("kind, confidence, outcome, resolved_by")
    .eq("org_id", orgId)
    .eq("status", "resolved")
    .not("outcome", "is", null)
    // RULE 2: the world settles these, not people. Human-adjudicated outcomes never train Neo.
    .in("resolved_by", ["verification", "redteam_run", "clock"]);

  const groups = new Map<string, { prior: number; n: number; correct: number; kind: string; band: string }>();
  for (const p of data ?? []) {
    const conf = Number(p.confidence);
    const band = bandOf(conf);
    const key = `${p.kind}:${band}`;
    const g = groups.get(key) ?? { prior: 0, n: 0, correct: 0, kind: p.kind as string, band };
    g.prior += conf;                                  // mean stated confidence in this band
    g.n += 1;
    if (p.outcome === "correct") g.correct += 1;
    groups.set(key, g);
  }

  const out = new Map<string, LearnedRate>();
  for (const [key, g] of groups) {
    const prior = g.prior / g.n;
    // RULE 1: smoothed toward the prior. With n=0 this returns exactly the prior; it only departs
    // as real outcomes pile up. No cliff, no 100%-off-three-samples.
    const smoothed = (g.correct + ALPHA * prior) / (g.n + ALPHA);
    const learned = g.n >= MIN_N_TO_ADJUST
      ? Math.min(CEIL, Math.max(FLOOR, smoothed))     // RULE 3: clamped. Never certain, never mute.
      : prior;                                        // too thin to move Neo's voice at all
    out.set(key, { kind: g.kind, band: g.band, prior, learned, n: g.n, correct: g.correct });
  }
  return out;
}

/**
 * Apply what's been learned to a fresh prediction's stated confidence.
 * If Neo has no track record for this kind of claim at this strength, the prior stands — and the
 * scorecard says so. Silence about what you don't know is part of knowing.
 */
export function calibrate(rates: Map<string, LearnedRate>, kind: string, prior: number): number {
  const r = rates.get(`${kind}:${bandOf(prior)}`);
  if (!r || r.n < MIN_N_TO_ADJUST) return prior;
  return r.learned;
}

/** For the scorecard: has Neo actually learned anything yet, and what did it change its mind about? */
export function learningSummary(rates: Map<string, LearnedRate>): {
  active: LearnedRate[];
  waiting: LearnedRate[];
} {
  const all = [...rates.values()];
  return {
    active: all.filter((r) => r.n >= MIN_N_TO_ADJUST).sort((a, b) => b.n - a.n),
    waiting: all.filter((r) => r.n < MIN_N_TO_ADJUST).sort((a, b) => b.n - a.n),
  };
}

export { MIN_N_TO_ADJUST, ALPHA };
