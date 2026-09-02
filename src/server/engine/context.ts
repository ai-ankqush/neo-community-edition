import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { planFor } from "@/lib/plans";
import type { PriorStage } from "./engine";

type SB = ReturnType<typeof supabaseAdmin>;

export interface EngineContext {
  input: Record<string, unknown>;
  priorStages: PriorStage[];
  ucName: string | null;
}

/**
 * Rebuild everything the engine needs to run a stage, from the DB. Single
 * source of truth shared by the (synchronous) /api/assess gate and the
 * (background) Inngest worker — so the worker can run from just the ids in the
 * event, without large payloads being passed around.
 */
export async function assembleContext(
  sb: SB,
  orgId: string,
  useCaseId: string | null,
  stage: string
): Promise<EngineContext> {
  const input: Record<string, unknown> = {};
  let priorStages: PriorStage[] = [];
  let ucName: string | null = null;

  if (useCaseId) {
    const { data: uc } = await sb
      .from("use_cases")
      .select("name, description, stack")
      .eq("org_id", orgId)
      .eq("id", useCaseId)
      .maybeSingle();
    if (uc) {
      ucName = uc.name;
      input.name = uc.name;
      input.stack = uc.stack;

      // Free plan: generic controls — the engine never sees the stack
      const { data: planRow } = await sb.from("organizations").select("plan").eq("id", orgId).single();
      if (!planFor(planRow?.plan).stackAwareControls) input.stack = undefined;

      // Living context: fold the client's answered questions and any free-form
      // context they have added into the description, so EVERY stage (including
      // classification and tier on a re-run) reflects the latest information.
      const [{ data: answeredQs }, { data: ctxEntries }] = await Promise.all([
        sb.from("questions").select("text, answer, status")
          .eq("org_id", orgId).eq("use_case_id", useCaseId).neq("status", "open"),
        sb.from("context_entries").select("note, created_at")
          .eq("org_id", orgId).eq("use_case_id", useCaseId).order("created_at", { ascending: true }),
      ]);

      let description = uc.description ?? "";
      const extras: string[] = [];
      if (answeredQs && answeredQs.length) {
        extras.push(
          "CLARIFYING Q&A FROM THE CLIENT:\n" +
            answeredQs
              .map((q) => `Q: ${q.text}\nA: ${q.status === "not_applicable" ? "(marked not applicable)" : q.answer}`)
              .join("\n\n")
        );
      }
      if (ctxEntries && ctxEntries.length) {
        extras.push(
          "ADDITIONAL CONTEXT ADDED BY THE CLIENT:\n" + ctxEntries.map((c) => `- ${c.note}`).join("\n")
        );
      }
      input.description = extras.length ? `${description}\n\n---\n${extras.join("\n\n")}` : description;

      const { data } = await sb
        .from("stage_records")
        .select("stage, accepted_output")
        .eq("org_id", orgId)
        .eq("use_case_id", useCaseId)
        .not("accepted_at", "is", null)
        .order("created_at", { ascending: true });
      priorStages = (data ?? []).map((r) => ({ stage: r.stage, output: r.accepted_output }));

      if (stage === "controls" || stage === "decision") {
        const { data: qs } = await sb
          .from("questions")
          .select("text, answer, status")
          .eq("org_id", orgId)
          .eq("use_case_id", useCaseId)
          .neq("status", "open");
        input.qa = (qs ?? []).map((q) => ({
          question: q.text,
          answer: q.status === "not_applicable" ? "(marked not applicable by the client)" : q.answer,
        }));
      }
    }
  }

  return { input, priorStages, ucName };
}
