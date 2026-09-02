import "server-only";
import type { BatteryKey } from "./batteries";

/**
 * Grounded battery selection — THE JUDGEMENT, made explicit.
 *
 * This is Neo's whole differentiator against agentic brute-force: we do NOT run
 * every battery. We reason about what matters for THIS AI from its real profile
 * (does it retrieve? touch sensitive data? can it act? whose model?) and select
 * only the batteries that are relevant — and we say WHY in one line. Deterministic
 * and honest: no LLM needed to decide what to attack; the LLM only judges results.
 */

export interface UseCaseSignals {
  touchesSensitiveData: boolean;  // PII / customer / employee / financial / health
  hasRetrieval: boolean;          // RAG / knowledge base / document retrieval
  canAct: boolean;                // tools / actions / integrations / autonomy
  hasVendorModel: boolean;        // third-party model in the path
  autonomyLevel?: string | null;
}

export interface Selection {
  batteries: BatteryKey[];
  reason: string;                 // the judgement, in words
  perBattery: { key: BatteryKey; why: string }[];
}

export function selectBatteries(s: UseCaseSignals): Selection {
  const per: { key: BatteryKey; why: string }[] = [];

  // prompt injection is universal — any AI that reads input can be injected;
  // it's the sharpest when the AI also retrieves untrusted content.
  per.push({
    key: "prompt_injection",
    why: s.hasRetrieval
      ? "Retrieves external content, so untrusted text can carry injected instructions (indirect injection)."
      : "Any AI that reads input can be steered by injected instructions.",
  });

  // jailbreak matters wherever a policy boundary exists — i.e. almost always,
  // but we call it out most strongly when the AI can act or expose data.
  per.push({
    key: "jailbreak",
    why: s.canAct || s.touchesSensitiveData
      ? "Has a policy boundary worth bypassing (it can act or reach sensitive data)."
      : "Policy-bypass framings test whether guardrails hold under pressure.",
  });

  // data exfiltration only when there's data worth taking / a retrieval surface.
  if (s.touchesSensitiveData || s.hasRetrieval) {
    per.push({
      key: "data_exfiltration",
      why: s.touchesSensitiveData
        ? "Touches sensitive/personal data — disclosure and covert exfil are in scope."
        : "Has a retrieval surface that could return data outside the caller's entitlement.",
    });
  }

  // tool/action abuse only when the AI can actually do something.
  if (s.canAct) {
    per.push({
      key: "tool_abuse",
      why: `Can take consequential actions${s.autonomyLevel ? ` (autonomy: ${s.autonomyLevel})` : ""} — unapproved-action attempts are in scope.`,
    });
  }

  const skipped: string[] = [];
  if (!(s.touchesSensitiveData || s.hasRetrieval)) skipped.push("data exfiltration (no sensitive data or retrieval surface)");
  if (!s.canAct) skipped.push("tool/action abuse (this AI can't act)");

  const reason =
    `Selected ${per.length} of 4 batteries for this AI` +
    (skipped.length ? `; skipped ${skipped.join(" and ")}.` : ".") +
    " Relevance over volume — we attack what matters here, not everything.";

  return { batteries: per.map((p) => p.key), reason, perBattery: per };
}
