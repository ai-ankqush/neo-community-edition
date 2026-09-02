/**
 * Model list prices in USD per 1,000,000 tokens, used to turn factual token
 * counts into estimated dollar spend for FinOps.
 *
 * These are LIST prices. Prompt caching makes real spend lower (cached input
 * reads are far cheaper), so the dollar figures here are a conservative (high)
 * estimate — tokens are exact, dollars are an upper bound.
 *
 * Override without a deploy by setting MODEL_PRICING_JSON in the environment,
 * e.g. {"claude-opus-4-6":{"in":15,"out":75}}.
 */
type Rate = { in: number; out: number };

const DEFAULT_RATES: Record<string, Rate> = {
  "claude-opus-4-6": { in: 15, out: 75 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-haiku-4-5-20251001": { in: 1, out: 5 },
};

const ENV_RATES: Record<string, Rate> = (() => {
  try {
    return JSON.parse(process.env.MODEL_PRICING_JSON ?? "{}");
  } catch {
    return {};
  }
})();

const FALLBACK: Rate = { in: 5, out: 15 };

export function rateFor(model: string): Rate {
  return ENV_RATES[model] ?? DEFAULT_RATES[model] ?? FALLBACK;
}

export function costUSD(model: string, inputTokens: number, outputTokens: number): number {
  const r = rateFor(model);
  return (inputTokens / 1_000_000) * r.in + (outputTokens / 1_000_000) * r.out;
}

export const PRICING_NOTE =
  "Dollars are estimated at model list prices; prompt caching makes actual spend lower. Token counts are exact.";

export function fmtUSD(n: number): string {
  if (n >= 100) return `$${n.toFixed(0)}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}
