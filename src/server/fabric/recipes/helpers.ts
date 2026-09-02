import type { CheckResult } from "../types";
import type { ProviderClient, PreflightResult } from "./types";

export async function safeJson(res: Response): Promise<Record<string, unknown> | null> {
  try { return (await res.json()) as Record<string, unknown>; } catch { return null; }
}

export const pass = (note: string, evidence?: unknown): CheckResult => ({
  result: "pass", note, normalizedEvidence: evidence, confidence: "high", policyDecision: "allow",
});

export const fail = (note: string, remediationHint: string): CheckResult => ({
  result: "fail", note, remediationHint, confidence: "high", policyDecision: "conditions",
});

export const errorResult = (note: string, remediationHint?: string): CheckResult => ({
  result: "error", note, remediationHint,
});

/** Wrap a check so transport/auth errors become a clean error CheckResult. */
export async function guarded(fn: () => Promise<CheckResult>): Promise<CheckResult> {
  try { return await fn(); }
  catch (e) { return errorResult(e instanceof Error ? e.message : "check failed"); }
}

/** Standard 1-test preflight: an endpoint that proves auth + reachability. */
export async function reachable(
  client: ProviderClient, path: string, label = "Authenticated & reachable",
): Promise<PreflightResult> {
  try {
    const res = await client.request(path);
    if (res.status === 401 || res.status === 403) return { id: "auth", label, state: "auth_failed", detail: `HTTP ${res.status}` };
    if (!res.ok) return { id: "auth", label, state: "unreachable", detail: `HTTP ${res.status}` };
    return { id: "auth", label, state: "ready" };
  } catch (e) {
    return { id: "auth", label, state: "unreachable", detail: e instanceof Error ? e.message : "error" };
  }
}
