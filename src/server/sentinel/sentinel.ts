import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { forwardFinding } from "@/server/action-control/soc";

/** Neo Sentinel — Neo's own membrane, pointed at actors ON the Neo app.
 *  Observe (record behavioural events) → decide (score a session for hostility) →
 *  respond (nudge the actor + alert the SOC). Defensive on reads so an un-applied
 *  migration never breaks a page. */

export type SentinelKind =
  | "rls_probe" | "enumeration" | "prompt_injection" | "mass_export" | "privilege_probe"
  | "finding" | "nudge";
export type SentinelSeverity = "info" | "low" | "medium" | "high";

const WEIGHT: Record<SentinelSeverity, number> = { info: 0, low: 1, medium: 3, high: 6 };
const HOSTILE_THRESHOLD = 6;          // cumulative weight in the window → hostile
                                       // (one clear high-severity act, or repeated probing, crosses it)
const WINDOW_SEC = 180;

export interface SentinelEvent { kind: string; severity: string; detail: string | null; created_at: string }
export interface SessionScore { hostile: boolean; score: number; reasons: string[]; events: SentinelEvent[] }

/** Record one behavioural event. Best-effort; never throws into the caller. */
export async function recordEvent(orgId: string, userId: string, kind: SentinelKind, severity: SentinelSeverity, detail?: string): Promise<void> {
  try {
    await supabaseAdmin().from("sentinel_events").insert({ org_id: orgId, user_id: userId, kind, severity, detail: detail ?? null });
  } catch (e) {
    console.error("sentinel recordEvent failed", e);
  }
}

async function recentEvents(orgId: string, userId: string, sinceSec = WINDOW_SEC): Promise<SentinelEvent[]> {
  try {
    const since = new Date(Date.now() - sinceSec * 1000).toISOString();
    const { data } = await supabaseAdmin()
      .from("sentinel_events").select("kind, severity, detail, created_at")
      .eq("org_id", orgId).eq("user_id", userId).gte("created_at", since)
      .order("created_at", { ascending: false }).limit(50);
    return (data as SentinelEvent[] | null) ?? [];
  } catch {
    return [];
  }
}

const REASON: Record<string, string> = {
  rls_probe: "tried to reach another tenant's data",
  enumeration: "probed object IDs it shouldn't",
  prompt_injection: "tried to jailbreak Ask Neo",
  mass_export: "attempted a bulk export",
  privilege_probe: "tried to elevate its own access",
};

/** Score the actor's recent activity. Hostile when consequential signals stack up. */
export async function scoreSession(orgId: string, userId: string): Promise<SessionScore> {
  const events = await recentEvents(orgId, userId);
  const signal = events.filter((e) => e.kind !== "finding" && e.kind !== "nudge");
  let score = 0;
  const kinds = new Set<string>();
  for (const e of signal) {
    score += WEIGHT[(e.severity as SentinelSeverity)] ?? 0;
    kinds.add(e.kind);
  }
  const reasons = [...kinds].map((k) => REASON[k]).filter(Boolean);
  return { hostile: score >= HOSTILE_THRESHOLD, score, reasons, events: signal };
}

/** Raise a finding: record it, push a nudge for the actor, alert the SOC. */
export async function raiseFinding(orgId: string, userId: string, score: SessionScore): Promise<void> {
  const reasonText = score.reasons.length ? score.reasons.join("; ") : "unusual, consequential activity";
  await recordEvent(orgId, userId, "finding", "high", `Hostile session (score ${score.score}): ${reasonText}`);
  await recordEvent(orgId, userId, "nudge", "high", "Neo is watching — this activity was detected and logged.");
  // Alert the SOC over the same webhook the Action Fabric uses.
  await forwardFinding(orgId, {
    event: "sentinel",
    severity: "high",
    kind: "app_intrusion",
    actor: userId,
    score: score.score,
    message: `Neo Sentinel: hostile activity on the Neo app — ${reasonText}.`,
  });
}

/** Is there a live nudge to show this actor right now? (drives the in-app watcher) */
export async function activeNudge(orgId: string, userId: string, sinceSec = 90): Promise<{ active: boolean; detail: string | null; reasons: string[] }> {
  const events = await recentEvents(orgId, userId, sinceSec);
  const nudge = events.find((e) => e.kind === "nudge");
  const finding = events.find((e) => e.kind === "finding");
  return { active: Boolean(nudge), detail: nudge?.detail ?? null, reasons: finding?.detail ? [finding.detail] : [] };
}

/** Quick signature check for prompt-injection attempts against Ask Neo. */
const INJECTION = /\b(ignore (all|your|previous|the) (instructions|rules|policy)|disregard (the|your) (instructions|rules)|system prompt|jailbreak|exfiltrat|dump (the|all|our) (data|database|org)|reveal your (instructions|prompt))\b/i;
export function looksLikeInjection(text: string): boolean {
  return INJECTION.test(text ?? "");
}
