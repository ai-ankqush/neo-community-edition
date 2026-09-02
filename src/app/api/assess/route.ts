import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, ApiError } from "@/lib/rbac";
import { ensureOrg } from "@/lib/org";
import { supabaseAdmin } from "@/lib/supabase";
import { STAGES } from "@/lib/types/stages";
import { planFor, currentPeriod } from "@/lib/plans";
import { trialState } from "@/lib/trial";
import { inngest } from "@/lib/inngest";

/**
 * POST /api/assess - validate, enforce plan limits, create the engine_jobs row
 * (status 'queued'), and emit an Inngest event. The durable worker
 * (src/server/engine/inngest.ts) runs the stage with retries + concurrency
 * throttling and writes the terminal status back. Returns the job id at once;
 * the UI polls /api/jobs/:id and the bell announces completion.
 */
export const maxDuration = 30; // this route only queues now; the worker does the work

const AssessRequest = z.object({
  useCaseId: z.string().uuid().optional(),
  stage: z.enum(STAGES),
  input: z.record(z.string(), z.unknown()),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole("org_admin", "assessor");
    const body = AssessRequest.parse(await req.json());
    const orgId = await ensureOrg(session.orgId);
    const sb = supabaseAdmin();

    // ---- validate the use case + synchronous gate (worker rebuilds context) ----
    let ucName: string | null = null;

    if (body.useCaseId) {
      const { data: uc } = await sb
        .from("use_cases")
        .select("name")
        .eq("org_id", orgId)
        .eq("id", body.useCaseId)
        .maybeSingle();
      if (!uc) throw new ApiError(404, "Use case not found");
      ucName = uc.name;

      // Controls must not be generated from unanswered questions.
      if (body.stage === "controls") {
        const { count: openCount } = await sb
          .from("questions")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("use_case_id", body.useCaseId)
          .eq("status", "open");
        if ((openCount ?? 0) > 0) {
          throw new ApiError(
            400,
            `Answer all ${openCount} open question${openCount === 1 ? "" : "s"} (or mark them Not applicable) before generating controls.`
          );
        }
      }
    }

    // ---- plan enforcement: regen cap, slot consumption, token budget ----
    const { data: orgRow } = await sb
      .from("organizations").select("plan, trial_ends_at").eq("id", orgId).single();

    // trial gate: an expired trial cannot run the engine until they pick a plan
    const ts = trialState(orgRow?.plan, (orgRow?.trial_ends_at as string | null) ?? null);
    if (ts.expired) {
      throw new ApiError(402, "Your free trial has ended. Choose a plan to continue.");
    }

    const limits = planFor(orgRow?.plan);
    const period = currentPeriod();

    if (body.useCaseId) {
      // regeneration cap per stage per use case
      const { count: regenCount } = await sb
        .from("engine_jobs")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("use_case_id", body.useCaseId)
        .eq("stage", body.stage);
      if ((regenCount ?? 0) >= limits.regenPerStage) {
        throw new ApiError(
          429,
          `Regeneration limit reached for this stage (${limits.regenPerStage} runs). Contact support if you need more.`
        );
      }

      // first generation on a use case: record it for analytics. The active
      // use-case cap is enforced at creation (see POST /api/use-cases), so no
      // per-period gate here — archiving a use case frees capacity.
      const { data: consumed } = await sb
        .from("slot_consumptions")
        .select("id")
        .eq("org_id", orgId)
        .eq("use_case_id", body.useCaseId)
        .maybeSingle();
      if (!consumed) {
        await sb.from("slot_consumptions").insert({
          org_id: orgId,
          use_case_id: body.useCaseId,
          use_case_name: ucName,
          period,
        });
      }
    }

    // monthly token budget
    if (Number.isFinite(limits.tokensPerMonth)) {
      const { data: usage } = await sb
        .from("usage_records")
        .select("input_tokens, output_tokens")
        .eq("org_id", orgId)
        .eq("period", period)
        .maybeSingle();
      const total = Number(usage?.input_tokens ?? 0) + Number(usage?.output_tokens ?? 0);
      if (total >= limits.tokensPerMonth) {
        throw new ApiError(
          429,
          `Monthly engine budget reached on ${limits.label}. Upgrade your plan or wait for renewal.`
        );
      }
    }

    // ---- create the job record ----
    const { data: job, error: jobErr } = await sb
      .from("engine_jobs")
      .insert({
        org_id: orgId,
        use_case_id: body.useCaseId ?? null,
        use_case_name: ucName,
        stage: body.stage,
        status: "queued",
        created_by: session.userId,
      })
      .select("id")
      .single();
    if (jobErr) throw jobErr;

    // ---- hand off to the durable worker ----
    await inngest.send({
      name: "engine/stage.requested",
      data: {
        jobId: job.id,
        orgId,
        useCaseId: body.useCaseId ?? null,
        stage: body.stage,
        userId: session.userId,
        input: body.input,
      },
    });

    return NextResponse.json({ jobId: job.id, stage: body.stage, status: "queued" });
  } catch (err) {
    if (err instanceof ApiError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError)
      return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error("ENGINE ERROR", err);
    return NextResponse.json({ error: "Engine error - check server logs" }, { status: 500 });
  }
}
