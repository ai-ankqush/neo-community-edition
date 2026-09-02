import "server-only";
import { supabaseAdmin } from "./supabase";

/**
 * Record one fine-grained usage event (per use case + stage + model) for
 * FinOps. Append-only; never throws. Powers /admin/finops. This is in addition
 * to the monthly org rollup written by recordUsage.
 */
export async function recordUsageEvent(
  orgId: string,
  ev: { useCaseId: string | null; stage: string; model: string; inputTokens: number; outputTokens: number }
): Promise<void> {
  try {
    await supabaseAdmin().from("usage_events").insert({
      org_id: orgId,
      use_case_id: ev.useCaseId,
      stage: ev.stage,
      model: ev.model,
      input_tokens: ev.inputTokens,
      output_tokens: ev.outputTokens,
    });
  } catch (err) {
    console.error("USAGE EVENT FAILED", err);
  }
}

/** Roll token usage into the org's monthly usage record. */
export async function recordUsage(
  orgId: string,
  inputTokens: number,
  outputTokens: number
): Promise<void> {
  try {
    const period = new Date().toISOString().slice(0, 7); // YYYY-MM
    const sb = supabaseAdmin();
    const { data } = await sb
      .from("usage_records")
      .select("id, input_tokens, output_tokens, assessments_run")
      .eq("org_id", orgId)
      .eq("period", period)
      .maybeSingle();

    if (data) {
      await sb
        .from("usage_records")
        .update({
          input_tokens: Number(data.input_tokens) + inputTokens,
          output_tokens: Number(data.output_tokens) + outputTokens,
          assessments_run: data.assessments_run + 1,
        })
        .eq("id", data.id);
    } else {
      await sb.from("usage_records").insert({
        org_id: orgId,
        period,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        assessments_run: 1,
      });
    }
  } catch (err) {
    console.error("USAGE RECORD FAILED", err);
  }
}
