/** Deterministic control → capability mapping (no LLM).
 *
 *  SAFETY PRINCIPLE: a wrong "verified" is worse than no verification. We only bind a control
 *  to a capability when the capability's check genuinely PROVES that control's intent. When in
 *  doubt we return null (Manual) — a false negative (a verifiable control shown as Manual) is
 *  harmless; a false positive (a green PASS that proves the wrong thing) destroys credibility.
 *
 *  Two guards make this safe:
 *   1) ATTESTATION controls — registering/documenting/defining a policy, owner, classification,
 *      risk acceptance, process, training — can't be proven by reading one system's config, so
 *      they stay Manual even if they mention a vendor or tech.
 *   2) Positive rules require phrasing about the ACTUAL technical state the capability checks —
 *      not a bare vendor/framework name (a control that merely names "OpenAI" as the vendor is
 *      NOT a check that the OpenAI platform is reachable).
 */

import { CAPABILITIES } from "./capabilities";
import { techForControl } from "@/lib/tech-catalog";

// Capability provider id → the catalog tech name(s) that provider corresponds to. Used by the
// cross-tech guard: a capability may only verify a control if the provider it checks is a tech the
// control actually names — otherwise the capability would prove a DIFFERENT system than the control
// is about (e.g. a Zscaler-only control must never be "verified" by a Splunk ingestion check).
const PROVIDER_TECH: Record<string, string[]> = {
  github: ["GitHub"], okta: ["Okta"], entra: ["Microsoft Entra ID", "Entra"],
  google_workspace: ["Google Workspace"], aws: ["AWS"], gcp: ["GCP", "Google Cloud"],
  azure: ["Azure"], servicenow: ["ServiceNow"], jira: ["Jira"], splunk: ["Splunk"],
  vault: ["HashiCorp Vault", "Vault"], snowflake: ["Snowflake"], databricks: ["Databricks"],
  purview: ["Purview"], datadog: ["Datadog"], openai: ["OpenAI"], anthropic: ["Anthropic"],
  langsmith: ["LangSmith", "LangChain"],
};

/** Cross-tech guard. Returns true if the capability is allowed to verify this control:
 *  - allowed when one of the capability's providers is a tech the control actually names, OR
 *  - allowed when the control names NO catalog tech at all (service-name/process controls like
 *    "enable CloudTrail" — we can't cross-check, so we defer to the keyword rules), and
 *  - BLOCKED only when the control clearly names some other tech but not the capability's provider
 *    (the genuine cross-tech false-bind). Never nulls a legit secondary-tech proof. */
function capabilityMatchesControlTech(capId: string, control: string): boolean {
  const cap = CAPABILITIES[capId];
  if (!cap) return false;
  const t = (control ?? "").toLowerCase();
  const providerNamed = cap.providers.some((p) =>
    (PROVIDER_TECH[p] ?? []).some((name) => t.includes(name.toLowerCase())),
  );
  if (providerNamed) return true;
  // No provider tech named. Only block if the control names some OTHER concrete tech (mismatch);
  // if it names none (service-name/process), allow and let the keyword rules decide.
  const namedTechs = techForControl(control, null);
  return namedTechs.length === 0;
}

// Registering/documenting/owning/classifying/accepting-risk = attestation → never auto-verified.
const ATTESTATION =
  /\b(polic(y|ies)|procedure|process|runbook|playbook|named (business )?owner|business owner|accountabilit|ownership|data classification|classif(y|ied|ication)|risk tier|risk acceptance|accept(ed)? (the )?risk|sign[- ]?off|attestation|awareness|train(ing|ed)|roles and responsibilit|governance (committee|board)|\braci\b|document(ed|ation)?|registered? (in|the|it)|maintain a (record|register|inventory of))\b/;

/** Returns a capability_id the control can be verified by, or null (Manual). */
export function capabilityForControl(pillar: number | null | undefined, control: string | null | undefined): string | null {
  const p = Number(pillar ?? 0);
  const t = (control ?? "").toLowerCase();
  if (!t) return null;

  // Pillar 1 — ONLY an explicit machine-readable AI-BOM artifact is auto-verifiable (a real file
  // we read). "Register X in the AI inventory" is a GRC record = attestation, not this.
  if (p === 1 && /\bai-?bom\b|\bml-?bom\b|\bsbom\b|cyclonedx|bill of materials/.test(t)) {
    return "ai_bom_present_and_valid";
  }
  // NOTE: ai_platform_inventory is intentionally NOT auto-mapped — naming a model vendor in a
  // control is far too easy to mis-bind (it produced false passes). Assign it manually only when
  // a control genuinely means "enumerate the models the platform exposes".

  // Everything past here must be a concrete technical control, not an attestation.
  if (ATTESTATION.test(t)) return null;

  // Pillar 2 — MFA actually ENFORCED at the identity provider.
  if (p === 2 && /\bmfa\b|\b2fa\b|multi-?factor|two-factor|phishing[- ]resistant|authentication strength|require[sd]?\s+(mfa|multi-?factor)|enforce[sd]?\s+(mfa|multi-?factor|conditional access)/.test(t)) {
    // ...but not when the control is really about the ACCESS MODEL (RBAC / role separation /
    // least privilege / segregation of duties). mfa_enforced proves MFA only — it can't prove
    // the role model, so a pass there would over-claim coverage. Those stay Manual.
    if (/role-based access|\brbac\b|separate roles|role separation|segregation of dut(y|ies)|least privilege/.test(t)) return null;
    return "mfa_enforced";
  }

  // Pillar 9 — a concrete monitoring STATE (enabled / ingesting / tracing), not a logging policy.
  if (p === 9 || /\blog(ging|s)?\b|audit trail|monitor|trac(e|es|ing)|observ/.test(t)) {
    if (/agent trac(e|es|ing)|langsmith|capture .*traces|tracing (is )?enabled|prompt trac/.test(t)) return "agent_tracing_enabled";
    if (/\bsiem\b|splunk|log ingestion|log management|log forwarding|ingest(ing)?\s+.*logs/.test(t)) return "siem_log_ingestion";
    if (/audit logging (is )?enabled|cloudtrail|activity logging enabled|cloud logging enabled|diagnostic setting/.test(t)) return "cloud_audit_logging_enabled";
  }

  // Pillar 7 / 10 — changes actually flowing through a change-management system of record.
  if ((p === 7 || p === 10) && /change (management|request|control)\b|\bcab\b|change ticket|change record/.test(t)) {
    return "change_management_linked";
  }

  return null;
}

/** Guard: only return the id if it's a real registered capability AND its provider is a tech the
 *  control actually names (the cross-tech guard) — so one connection's check can never falsely
 *  "verify" a control about a different system. When in doubt, returns null (Manual). */
export function safeCapabilityForControl(pillar: number | null | undefined, control: string | null | undefined): string | null {
  const id = capabilityForControl(pillar, control);
  if (!id || !CAPABILITIES[id]) return null;
  if (!capabilityMatchesControlTech(id, control ?? "")) return null;
  return id;
}
