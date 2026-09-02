import "server-only";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { getCapability } from "./capabilities";
import type { CheckResult } from "./types";

/** Persist a check result as a first-class control_evidence artifact.
 *  Computes valid_until from the capability's freshness rule (unless the check
 *  set its own) and a tamper hash over the evidence payload (integrity ledger). */
export async function recordEvidence(input: {
  orgId: string;
  useCaseId?: string | null;
  controlId?: string | null;
  capabilityId: string;
  provider: string;
  actor: string;
  check: CheckResult;
}): Promise<{ id: string | null }> {
  const cap = getCapability(input.capabilityId);
  const validUntil =
    input.check.validUntil ??
    (cap?.defaultValidityHours
      ? new Date(Date.now() + cap.defaultValidityHours * 3600_000).toISOString()
      : null);

  const payload = {
    org_id: input.orgId,
    use_case_id: input.useCaseId ?? null,
    control_id: input.controlId ?? null,
    capability_id: input.capabilityId,
    provider: input.provider,
    result: input.check.result,
    policy_decision: input.check.policyDecision ?? null,
    confidence: input.check.confidence ?? null,
    raw_artifact_ref: input.check.rawArtifactRef ?? null,
    normalized_artifact: input.check.normalizedEvidence ?? null,
    remediation_hint: input.check.remediationHint ?? null,
    checked_at: new Date().toISOString(),
    valid_until: validUntil,
    trigger_for_recheck: input.check.triggerForRecheck ?? cap?.recheckTrigger ?? null,
    created_by: input.actor,
  };
  const tamper_hash = crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");

  const { data, error } = await supabaseAdmin()
    .from("control_evidence")
    .insert({ ...payload, tamper_hash })
    .select("id")
    .single();
  if (error) {
    console.error("recordEvidence failed", error.message);
    return { id: null };
  }
  return { id: data.id };
}

/** Latest evidence per capability for a use case (for dashboards / decision packs). */
export async function latestEvidence(orgId: string, useCaseId: string) {
  const { data } = await supabaseAdmin()
    .from("control_evidence")
    .select("id, capability_id, provider, result, raw_artifact_ref, remediation_hint, checked_at, valid_until, confidence")
    .eq("org_id", orgId)
    .eq("use_case_id", useCaseId)
    .order("checked_at", { ascending: false });
  const seen = new Set<string>();
  return (data ?? []).filter((e) => (seen.has(e.capability_id) ? false : (seen.add(e.capability_id), true)));
}
