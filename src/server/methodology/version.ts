import "server-only";

/**
 * Methodology version recorded on every stage record and assessment output.
 * Bump when prompt content changes materially - assessments are traceable
 * to the exact methodology version that produced them.
 */
export const METHODOLOGY_VERSION = "1.2.1";

export const ENGINE_MODELS = {
  /** Judgment-heavy stages */
  deep: process.env.ENGINE_MODEL_DEEP ?? "claude-opus-4-6",
  /** Fast/structured stages */
  fast: process.env.ENGINE_MODEL_FAST ?? "claude-sonnet-4-6",
  /** Code scaffolds — review-before-apply starting artifacts; speed matters, Haiku is plenty. */
  scaffold: process.env.ENGINE_MODEL_SCAFFOLD ?? "claude-haiku-4-5-20251001",
} as const;
