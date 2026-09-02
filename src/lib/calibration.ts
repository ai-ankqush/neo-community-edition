/**
 * The scorecard maths. Deliberately plain — anyone should be able to check it by hand, because a
 * track record you have to take on faith isn't a track record.
 *
 * Two numbers that answer two different questions:
 *
 *   ACCURACY  — "when Neo commits, how often is it right?"      (hit rate)
 *   CALIBRATION — "when Neo says 70%, is it right ~70% of the time?"  (reliability + Brier)
 *
 * The second is the one that matters and the one nobody publishes. A model that is always
 * confident and often right is still lying about its uncertainty. Being right 70% of the time when
 * you SAID 70% is worth more than being right 90% of the time when you said 99%.
 */

export interface Scored {
  kind: string;
  confidence: number;      // what Neo said, 0..1
  correct: boolean;        // what happened
}

export interface Bucket {
  label: string;
  lo: number;
  hi: number;
  n: number;
  claimed: number;         // mean confidence Neo asserted in this bucket
  actual: number;          // observed hit rate
}

export interface Scorecard {
  n: number;
  correct: number;
  accuracy: number | null;     // null when there's nothing to report — say so, don't print a 0
  brier: number | null;        // mean squared error of the probability. Lower is better. 0.25 = coin flip.
  buckets: Bucket[];
  byKind: { kind: string; n: number; correct: number; accuracy: number | null }[];
  enough: boolean;             // do we have the right to state a number at all?
  overconfident: number | null; // claimed − actual, averaged. >0 means Neo talks bigger than it delivers.
}

/** Below this, we show the work but refuse to publish a headline number. */
export const MIN_N = 20;

const BANDS: [string, number, number][] = [
  ["50–65%", 0.5, 0.65],
  ["65–80%", 0.65, 0.8],
  ["80–90%", 0.8, 0.9],
  ["90–100%", 0.9, 1.01],
];

export function scoreCalibration(rows: Scored[]): Scorecard {
  const n = rows.length;
  const correct = rows.filter((r) => r.correct).length;

  if (n === 0) {
    return { n: 0, correct: 0, accuracy: null, brier: null, buckets: [], byKind: [], enough: false, overconfident: null };
  }

  // Brier score: mean((p − outcome)²). The standard, unforgiving measure of a probabilistic claim.
  const brier = rows.reduce((s, r) => s + Math.pow(r.confidence - (r.correct ? 1 : 0), 2), 0) / n;

  const buckets: Bucket[] = BANDS.map(([label, lo, hi]) => {
    const inBand = rows.filter((r) => r.confidence >= lo && r.confidence < hi);
    return {
      label, lo, hi, n: inBand.length,
      claimed: inBand.length ? inBand.reduce((s, r) => s + r.confidence, 0) / inBand.length : 0,
      actual: inBand.length ? inBand.filter((r) => r.correct).length / inBand.length : 0,
    };
  }).filter((b) => b.n > 0);

  const kinds = [...new Set(rows.map((r) => r.kind))];
  const byKind = kinds.map((kind) => {
    const k = rows.filter((r) => r.kind === kind);
    const c = k.filter((r) => r.correct).length;
    return { kind, n: k.length, correct: c, accuracy: k.length ? c / k.length : null };
  }).sort((a, b) => b.n - a.n);

  // The gap between what Neo claimed and what it delivered. Positive = bravado.
  const claimedMean = rows.reduce((s, r) => s + r.confidence, 0) / n;
  const actualMean = correct / n;

  return {
    n, correct,
    accuracy: actualMean,
    brier,
    buckets,
    byKind,
    enough: n >= MIN_N,
    overconfident: claimedMean - actualMean,
  };
}

/** Plain-language read of the numbers. No spin in either direction. */
export function verdictLine(s: Scorecard): string {
  if (!s.n) return "Neo hasn't committed to anything that's been settled yet. No claim to make.";
  if (!s.enough) {
    return `Only ${s.n} settled prediction${s.n === 1 ? "" : "s"} so far — too few to state a rate honestly. Neo will show one at ${MIN_N}.`;
  }
  const acc = Math.round((s.accuracy ?? 0) * 100);
  const gap = s.overconfident ?? 0;
  if (Math.abs(gap) <= 0.05) {
    return `Neo is right ${acc}% of the time, and its confidence matches its results to within 5 points. It knows what it knows.`;
  }
  if (gap > 0.05) {
    return `Neo is right ${acc}% of the time, but talks like it's right ${Math.round((s.accuracy ?? 0) * 100 + gap * 100)}%. It is overconfident by ${Math.round(gap * 100)} points — treat its numbers as optimistic until this closes.`;
  }
  return `Neo is right ${acc}% of the time — better than the ${Math.round((s.accuracy ?? 0) * 100 + gap * 100)}% it claims. It is underselling itself by ${Math.abs(Math.round(gap * 100))} points.`;
}
