import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { BY_KEY, redact, type BatteryKey, type Risk } from "./batteries";
import { sendProbe, type TargetSpec } from "./connect";
import { judge } from "./judge";
import { selectBatteries, type UseCaseSignals } from "./selector";
import { graduateConfirmed } from "./frontier";

/**
 * Live Fire — STEPPED, human-in-the-loop orchestration.
 *
 * Nothing fires without a human. `createRun` plans the attack (grounded selection
 * → ordered steps, each with plain-language intent + consequence + risk) and
 * persists the run — but fires NOTHING. The console then drives one step at a
 * time via `fireStep`, showing what each step does and stopping for confirmation.
 * A "dangerous" step (could disrupt the live service) cannot fire without an
 * explicit typed acknowledgement passed through as `confirmed`.
 *
 * Attempt-and-detect only; transcripts redacted before storage. Simulated targets
 * are flagged; "confirmed" means the probe demonstrably worked live.
 */

export interface PlanStep {
  index: number;
  battery: BatteryKey;
  ref: string;
  title: string;
  intent: string;
  consequence: string;
  risk: Risk;
  owasp: string;
  atlas: string;
}

export interface Plan {
  batteries: BatteryKey[];
  selectionReason: string;
  steps: PlanStep[];
}

/** The judgement, made into an ordered plan of steps. Deterministic — no firing. */
export function planRun(signals: UseCaseSignals, override?: BatteryKey[]): Plan {
  const sel = selectBatteries(signals);
  const chosen = (override && override.length ? override : sel.batteries).filter((k) => k in BY_KEY);
  const steps: PlanStep[] = [];
  for (const key of chosen) {
    const b = BY_KEY[key];
    for (const p of b.probes) {
      steps.push({ index: steps.length, battery: key, ref: p.ref, title: p.title, intent: p.intent, consequence: p.consequence, risk: p.risk, owasp: b.owasp, atlas: b.atlas });
    }
  }
  return { batteries: chosen, selectionReason: sel.reason, steps };
}

export interface CreateRunInput {
  orgId: string;
  useCaseId: string | null;
  authorizedBy: string;
  authorizationNote?: string | null;
  targetMethod: string;
  targetLabel?: string | null;
  signals: UseCaseSignals;
  batteries?: BatteryKey[];
}

/** Create the run + return the plan. Fires nothing. */
export async function createRun(input: CreateRunInput): Promise<{ runId: string; plan: Plan }> {
  const sb = supabaseAdmin();
  const plan = planRun(input.signals, input.batteries);
  const { data: run, error } = await sb.from("red_team_runs").insert({
    org_id: input.orgId,
    use_case_id: input.useCaseId,
    target_method: input.targetMethod,
    target_label: input.targetLabel ?? null,
    authorized_by: input.authorizedBy,
    authorization_note: input.authorizationNote ?? null,
    status: "running",
    mode: "attempt_detect",
    batteries: plan.batteries,
    selection_reason: plan.selectionReason,
    started_at: new Date().toISOString(),
  }).select("id").single();
  if (error) throw error;
  return { runId: run.id as string, plan };
}

export interface StepResult {
  ok: true;
  done: boolean;
  total: number;
  result: {
    battery: string; attack_ref: string; title: string; owasp_ref: string; atlas_ref: string;
    verdict: string; severity: string; judge_reason: string; mapped_control: string; remediation: string;
    transcript: { role: string; text: string }[];
  };
}

export class StepError extends Error { constructor(public status: number, message: string) { super(message); } }

/**
 * Fire ONE step. Re-derives the plan from signals (so the client can't lie about
 * which step or its risk), enforces the dangerous-step acknowledgement, sends the
 * probe, judges, persists the result, and updates the rollup. Completes + graduates
 * on the final step.
 */
export async function fireStep(args: {
  orgId: string; runId: string; signals: UseCaseSignals; target: TargetSpec; index: number; confirmed: boolean;
}): Promise<StepResult> {
  const sb = supabaseAdmin();
  const { data: run } = await sb.from("red_team_runs").select("id, batteries, status").eq("org_id", args.orgId).eq("id", args.runId).maybeSingle();
  if (!run) throw new StepError(404, "Run not found");

  const override = Array.isArray(run.batteries) ? (run.batteries as BatteryKey[]) : undefined;
  const plan = planRun(args.signals, override);
  const step = plan.steps[args.index];
  if (!step) throw new StepError(400, "No such step");
  if (step.risk === "dangerous" && !args.confirmed) {
    throw new StepError(428, "This step could disrupt the live service. Type the confirmation and acknowledge to proceed.");
  }

  const probe = BY_KEY[step.battery].probes.find((p) => p.ref === step.ref);
  if (!probe) throw new StepError(400, "Probe not found");
  const battery = BY_KEY[step.battery];

  const sent = await sendProbe(args.target, probe);
  const reply = sent.error ? `[target error: ${sent.error}]` : sent.reply;
  const j = sent.error
    ? { verdict: "inconclusive" as const, severity: "low" as const, reason: sent.error }
    : await judge(probe, reply);

  const resultRow = {
    run_id: args.runId, org_id: args.orgId,
    battery: step.battery, attack_ref: probe.ref, title: probe.title,
    owasp_ref: battery.owasp, atlas_ref: battery.atlas,
    verdict: j.verdict, severity: j.severity, judge_reason: j.reason,
    transcript: [
      { role: "attacker", text: redact(probe.prompt) },
      { role: "target", text: redact(reply).slice(0, 4000) },
    ],
    mapped_control: battery.breakingControl,
    remediation: battery.remediation,
  };
  await sb.from("red_team_results").insert(resultRow);

  // rollup from all results fired so far on this run
  const { data: all } = await sb.from("red_team_results").select("verdict, battery").eq("run_id", args.runId);
  const rows = all ?? [];
  const counts = {
    attempted: rows.length,
    confirmed: rows.filter((r) => r.verdict === "confirmed").length,
    blocked: rows.filter((r) => r.verdict === "blocked").length,
    inconclusive: rows.filter((r) => r.verdict === "inconclusive").length,
  };
  const done = rows.length >= plan.steps.length;

  await sb.from("red_team_runs").update({
    ...counts,
    status: done ? "complete" : "running",
    finished_at: done ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq("id", args.runId);

  if (done) {
    try {
      const confirmedBatteries = rows.filter((r) => r.verdict === "confirmed").map((r) => String(r.battery));
      if (confirmedBatteries.length) await graduateConfirmed(args.orgId, confirmedBatteries);
    } catch (e) { console.error("frontier graduation skipped", e); }
  }

  return { ok: true, done, total: plan.steps.length, result: resultRow };
}

/** Derive attack-surface signals from a use case row (heuristic, honest defaults). */
export function signalsFromUseCase(uc: {
  description?: string | null; name?: string | null; data_types?: string[] | null;
  can_act?: boolean | null; autonomy_level?: string | null; uses_retrieval?: boolean | null;
  vendor_model?: boolean | null;
}): UseCaseSignals {
  const text = `${uc.name ?? ""} ${uc.description ?? ""} ${(uc.data_types ?? []).join(" ")}`.toLowerCase();
  const SENSITIVE = /hr|employee|payroll|health|medical|patient|pii|personal|customer|financial|finance|salary|ssn|confidential|legal/;
  const RETRIEVAL = /rag|retriev|knowledge base|kb\b|document|search|index|vector|embedding/;
  const ACT = /agent|action|tool|integrat|autonom|execute|workflow|api call|send|refund|delete|approve/;
  return {
    touchesSensitiveData: (uc.data_types?.length ? true : false) || SENSITIVE.test(text),
    hasRetrieval: uc.uses_retrieval === true || RETRIEVAL.test(text),
    canAct: uc.can_act === true || ACT.test(text),
    hasVendorModel: uc.vendor_model === true,
    autonomyLevel: uc.autonomy_level ?? null,
  };
}
