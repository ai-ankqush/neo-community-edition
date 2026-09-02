import { inngest } from "@/lib/inngest";
import { supabaseAdmin } from "@/lib/supabase";
import { recordUsage, recordUsageEvent } from "@/lib/usage";
import { ENGINE_MODELS, METHODOLOGY_VERSION } from "@/server/methodology/version";
import { logAudit } from "@/lib/audit";
import type { Stage } from "@/lib/types/stages";
import { assembleContext } from "./context";
import { runStage, runControlsForPillars, CONTROLS_PILLAR_GROUPS, runArtifactsForControls, runRedTeam, type PriorStage, type ControlsPartialResult } from "./engine";
import { ControlsOutput } from "./schemas";

/**
 * Durable engine worker. /api/assess validates, enforces plan limits, creates
 * the engine_jobs row (status 'queued'), and emits `engine/stage.requested`.
 * This function runs the stage on Inngest's runtime with:
 *   - automatic retries (transient API/network errors)
 *   - concurrency throttling (global cap + one run per org) for rate limits
 *   - the controls stage fanned out per pillar-group, each step well under the
 *     function timeout — defeating the single-call 300s ceiling.
 * Terminal status (done/failed) is always written back, so jobs never hang.
 */
export const engineRunStage = inngest.createFunction(
  {
    id: "engine-run-stage",
    retries: 2,
    concurrency: [
      { limit: 5 }, // global cap — keep total Anthropic calls within rate limits
      { key: "event.data.orgId", limit: 3 }, // a few concurrent runs per org; a slow one won't block the next
    ],
    onFailure: async ({ event, error }) => {
      // Runs only after retries are exhausted. Mark the job failed so the UI
      // and watchdog agree. The original event is nested under event.data.event.
      const orig = (event as { data?: { event?: { data?: { jobId?: string } } } }).data?.event?.data;
      const jobId = orig?.jobId;
      if (!jobId) return;
      // Surface the real underlying exception (truncated) instead of a generic
      // message — critical for diagnosing self-host/BYO-key/DB failures.
      const msg = (error instanceof Error ? error.message : String(error ?? "Engine failed")).slice(0, 280);
      await supabaseAdmin()
        .from("engine_jobs")
        .update({
          status: "failed",
          error: msg || "Engine failed after retries. Please retry.",
          finished_at: new Date().toISOString(),
        })
        .eq("id", jobId);
    },
  },
  { event: "engine/stage.requested" },
  async ({ event, step }) => {
    const { jobId, orgId, useCaseId, stage, userId, input: rawInput } = event.data as {
      jobId: string;
      orgId: string;
      useCaseId: string | null;
      stage: string;
      userId: string;
      input?: Record<string, unknown>;
    };
    const sb = supabaseAdmin();

    // Mark running — MUST be a step. Inline side effects re-run on every Inngest
    // replay, including the final pass after mark-done, which would reset the
    // status back to "running". As a memoized step it runs exactly once.
    await step.run("mark-running", async () => {
      const { error } = await sb
        .from("engine_jobs")
        .update({ status: "running", started_at: new Date().toISOString() })
        .eq("id", jobId);
      if (error) console.error("MARK RUNNING FAILED", jobId, error.message);
    });

    // Step 1: assemble context + run the model.
    //
    // The controls stage is the heaviest generation (all 10 pillars in one shot ~
    // 16k tokens), the one most likely to brush the function/step timeout on
    // serverless hosts. So we FAN IT OUT: assemble context once, then run one
    // durable step per pillar-group (CONTROLS_PILLAR_GROUPS) in parallel — each a
    // small, fast call under the cap — and merge + validate the pieces as a whole.
    // Every other stage stays a single memoized round-trip.
    let draft: unknown;
    let model: string;
    let methodologyVersion: string;
    let usage: { inputTokens: number; outputTokens: number };
    let implemented: boolean;

    if (stage === "controls") {
      const ctx = await step.run("controls-context", async () => {
        const c = await assembleContext(sb, orgId, useCaseId ?? null, stage);
        const input = c.input && Object.keys(c.input).length ? c.input : rawInput ?? {};
        return { input, priorStages: c.priorStages };
      });

      // Concurrency cap: run the pillar groups a few at a time, not all at once.
      // Each group is its own durable step (so each stays a small call under the
      // serverless step timeout), but we bound how many hit the model provider
      // simultaneously — 4 concurrent opus calls can exceed a low-tier BYO key's
      // tokens-per-minute limit and get throttled, making it slower than one call.
      // Default 2; override with CONTROLS_CONCURRENCY (1 = fully sequential).
      const CONC = Math.min(4, Math.max(1, Number(process.env.CONTROLS_CONCURRENCY) || 2));
      const partials: ControlsPartialResult[] = [];
      for (let i = 0; i < CONTROLS_PILLAR_GROUPS.length; i += CONC) {
        const batch = CONTROLS_PILLAR_GROUPS.slice(i, i + CONC);
        const res = await Promise.all(
          batch.map((pillars, j) =>
            step.run(`run-controls-g${i + j}`, async () =>
              runControlsForPillars(pillars, ctx.input as Record<string, unknown>, ctx.priorStages as PriorStage[], orgId)
            )
          )
        );
        partials.push(...res);
      }

      // Merge every pillar-group's controls and validate against the full schema,
      // so the persisted draft is identical in shape to the single-call path.
      const mergedControls = partials.flatMap((p) => p.controls);
      draft = ControlsOutput.parse({ controls: mergedControls });
      model = partials[0]?.model ?? ENGINE_MODELS.deep;
      methodologyVersion = partials[0]?.methodologyVersion ?? METHODOLOGY_VERSION;
      usage = {
        inputTokens: partials.reduce((s, p) => s + p.usage.inputTokens, 0),
        outputTokens: partials.reduce((s, p) => s + p.usage.outputTokens, 0),
      };
      implemented = true;
    } else {
      // Single memoized round-trip. On retry only this step re-executes (the
      // Anthropic call is memoized once it succeeds).
      const r = await step.run(`run-${stage}`, async () => {
        const ctx = await assembleContext(sb, orgId, useCaseId ?? null, stage);
        const input =
          ctx.input && Object.keys(ctx.input).length ? ctx.input : rawInput ?? {};
        return runStage(stage as Stage, input, ctx.priorStages as PriorStage[], orgId);
      });
      draft = r.draft;
      model = r.model;
      methodologyVersion = r.methodologyVersion;
      usage = r.usage;
      implemented = r.implemented;
    }

    // Step 2: persist the draft + usage/audit (memoized once it succeeds).
    if (implemented) {
      await step.run("persist-records", async () => {
        await recordUsage(orgId, usage.inputTokens, usage.outputTokens);
        await recordUsageEvent(orgId, { useCaseId: useCaseId ?? null, stage, model, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens });
        await logAudit({
          orgId,
          actor: userId,
          action: "engine.generate",
          objectType: "use_case",
          objectId: useCaseId ?? undefined,
          detail: { stage, model, methodologyVersion, usage, jobId },
        });
        if (useCaseId) {
          const { error } = await sb.from("stage_records").insert({
            org_id: orgId,
            use_case_id: useCaseId,
            stage,
            ai_draft: draft,
            model,
            methodology_version: methodologyVersion,
          });
          if (error) throw new Error(`stage_records insert failed: ${error.message}`);
        }
      });
    }

    // Step 3: flip the job to done — isolated so a transient failure here
    // retries without re-inserting the draft, and surfaces in the run logs.
    await step.run("mark-done", async () => {
      const { error } = await sb
        .from("engine_jobs")
        .update({ status: "done", draft, model, finished_at: new Date().toISOString() })
        .eq("id", jobId);
      if (error) throw new Error(`engine_jobs done update failed: ${error.message}`);
    });

    return { ok: true, stage };
  }
);

/**
 * Implementation Pack v2: generate a real engineering artifact (Terraform /
 * policy / config / runbook) per control, mapped to the declared stack, and
 * cache it on control_items. On-demand, batched, durable.
 */
export const engineArtifacts = inngest.createFunction(
  {
    id: "engine-artifacts",
    retries: 2,
    concurrency: [{ limit: 4 }, { key: "event.data.orgId", limit: 1 }],
    onFailure: async ({ event }) => {
      const orig = (event as { data?: { event?: { data?: { jobId?: string } } } }).data?.event?.data;
      const jobId = orig?.jobId;
      if (!jobId) return;
      await supabaseAdmin()
        .from("engine_jobs")
        .update({ status: "failed", error: "Artifact generation failed after retries.", finished_at: new Date().toISOString() })
        .eq("id", jobId);
    },
  },
  { event: "engine/artifacts.requested" },
  async ({ event, step }) => {
    const { jobId, orgId, useCaseId, userId } = event.data as {
      jobId: string;
      orgId: string;
      useCaseId: string;
      userId: string;
    };
    const sb = supabaseAdmin();

    await step.run("mark-running", async () => {
      await sb.from("engine_jobs").update({ status: "running", started_at: new Date().toISOString() }).eq("id", jobId);
    });

    const loaded = await step.run("load", async () => {
      const { data: uc } = await sb.from("use_cases").select("stack").eq("org_id", orgId).eq("id", useCaseId).maybeSingle();
      const { data: ctrls } = await sb
        .from("control_items")
        .select("id, pillar, control, why, requirement, stack_implementation")
        .eq("org_id", orgId)
        .eq("use_case_id", useCaseId)
        .order("pillar", { ascending: true });
      return { controls: ctrls ?? [], stack: (uc?.stack as unknown) ?? null };
    });

    type Ctrl = { id: string; pillar: number; control: string; why: string | null; requirement: string; stack_implementation: string | null };
    const controls = loaded.controls as Ctrl[];

    if (controls.length === 0) {
      await step.run("done-empty", async () => {
        await sb.from("engine_jobs").update({ status: "done", finished_at: new Date().toISOString() }).eq("id", jobId);
      });
      return { ok: true, count: 0 };
    }

    // ONE control per call: each Claude generation is small and fast — well under the per-step
    // timeout that was killing multi-control batches. Run GROUP at a time to stay under Anthropic
    // rate limits; total wall-clock can far exceed any single timeout because each step is its own
    // invocation and Inngest spans them. A failed step is non-fatal (that control just gets no code).
    const GROUP = 8; // Haiku is fast + high rate-limit; run more at once to finish in fewer rounds
    const batches: Ctrl[][] = controls.map((c) => [c]);

    const usages: { inputTokens: number; outputTokens: number }[] = [];
    for (let g = 0; g < batches.length; g += GROUP) {
      const groupUsages = await Promise.all(
        batches.slice(g, g + GROUP).map((batch, j) =>
          step.run(`artifacts-batch-${g + j}`, async () => {
            const input = batch.map((c) => ({
              ref: c.id, pillar: c.pillar, control: c.control, why: c.why,
              requirement: c.requirement, stackImplementation: c.stack_implementation,
            }));
            try {
              const { artifacts, usage } = await runArtifactsForControls(input, loaded.stack, orgId);
              for (const a of artifacts) {
                await sb.from("control_items").update({
                  artifact_type: a.artifactType, artifact_language: a.language,
                  artifact_filename: a.filename, artifact_content: a.content,
                  artifact_generated_at: new Date().toISOString(),
                }).eq("org_id", orgId).eq("id", a.ref);
              }
              return usage;
            } catch (e) {
              console.error(`artifacts-batch-${g + j} failed`, e instanceof Error ? e.message : e);
              return { inputTokens: 0, outputTokens: 0 };
            }
          }),
        ),
      );
      usages.push(...groupUsages);
    }

    await step.run("finish", async () => {
      const inTok = usages.reduce((s, u) => s + u.inputTokens, 0);
      const outTok = usages.reduce((s, u) => s + u.outputTokens, 0);
      await recordUsage(orgId, inTok, outTok);
      await recordUsageEvent(orgId, { useCaseId, stage: "artifacts", model: ENGINE_MODELS.scaffold, inputTokens: inTok, outputTokens: outTok });
      await logAudit({ orgId, actor: userId, action: "artifacts.generate", objectType: "use_case", objectId: useCaseId, detail: { controls: controls.length } });
      await sb.from("engine_jobs").update({ status: "done", finished_at: new Date().toISOString() }).eq("id", jobId);
    });

    return { ok: true, count: controls.length };
  }
);

/**
 * Red Team: generate attack paths for a use case and score each against the
 * use case's CURRENT control posture (exposed / partial / blocked). Enterprise,
 * on-demand, durable.
 */
export const engineRedTeam = inngest.createFunction(
  {
    id: "engine-red-team",
    retries: 2,
    concurrency: [{ limit: 4 }, { key: "event.data.orgId", limit: 1 }],
    onFailure: async ({ event }) => {
      const orig = (event as { data?: { event?: { data?: { jobId?: string } } } }).data?.event?.data;
      const jobId = orig?.jobId;
      if (!jobId) return;
      await supabaseAdmin()
        .from("engine_jobs")
        .update({ status: "failed", error: "Red Team failed after retries.", finished_at: new Date().toISOString() })
        .eq("id", jobId);
    },
  },
  { event: "engine/redteam.requested" },
  async ({ event, step }) => {
    const { jobId, orgId, useCaseId, userId } = event.data as {
      jobId: string; orgId: string; useCaseId: string; userId: string;
    };
    const sb = supabaseAdmin();

    await step.run("mark-running", async () => {
      await sb.from("engine_jobs").update({ status: "running", started_at: new Date().toISOString() }).eq("id", jobId);
    });

    const loaded = await step.run("load", async () => {
      const { data: uc } = await sb.from("use_cases").select("name, description, tier, stack").eq("org_id", orgId).eq("id", useCaseId).maybeSingle();
      const { data: classifyRec } = await sb.from("stage_records")
        .select("accepted_output").eq("org_id", orgId).eq("use_case_id", useCaseId).eq("stage", "classify")
        .not("accepted_at", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
      const { data: controls } = await sb.from("control_items")
        .select("pillar, control, status, verification_status").eq("org_id", orgId).eq("use_case_id", useCaseId);
      return { uc, classify: classifyRec?.accepted_output ?? null, controls: controls ?? [] };
    });

    if (!loaded.uc) {
      await step.run("done-empty", async () => {
        await sb.from("engine_jobs").update({ status: "done", finished_at: new Date().toISOString() }).eq("id", jobId);
      });
      return { ok: true, count: 0 };
    }

    const generated = await step.run("generate", async () => {
      return runRedTeam({
        name: loaded.uc!.name,
        description: loaded.uc!.description ?? null,
        tier: loaded.uc!.tier ?? null,
        classify: loaded.classify,
        stack: loaded.uc!.stack ?? null,
        controls: loaded.controls as { pillar: number; control: string; status: string; verification_status: string | null }[],
      }, orgId);
    });

    await step.run("score-and-store", async () => {
      type Ctrl = { pillar: number; status: string; verification_status: string | null };
      const byPillar = new Map<number, Ctrl>();
      for (const c of loaded.controls as Ctrl[]) {
        const prev = byPillar.get(c.pillar);
        // prefer the strongest posture at that pillar
        const rank = (x: Ctrl) => (x.verification_status === "verified" || x.status === "in_place" ? 2 : x.status === "partial" || x.verification_status === "partial" ? 1 : 0);
        if (!prev || rank(c) > rank(prev)) byPillar.set(c.pillar, c);
      }
      function exposure(pillar: number): string {
        const c = byPillar.get(pillar);
        if (!c) return "exposed"; // no control covers this pillar
        if (c.verification_status === "verified" || c.status === "in_place") return "blocked";
        if (c.status === "partial" || c.verification_status === "partial") return "partial";
        return "exposed";
      }

      await sb.from("red_team_findings").delete().eq("org_id", orgId).eq("use_case_id", useCaseId);
      const rows = generated.attacks.map((a) => ({
        org_id: orgId,
        use_case_id: useCaseId,
        vector: a.vector,
        technique: a.technique,
        scenario: a.scenario,
        unguarded_outcome: a.unguardedOutcome,
        severity: a.severity,
        owasp_ref: a.owaspRef || null,
        atlas_ref: a.atlasRef || null,
        blocking_pillar: a.blockingPillar,
        blocking_control: a.blockingControl,
        exposure: exposure(a.blockingPillar),
      }));
      if (rows.length) await sb.from("red_team_findings").insert(rows);
      await sb.from("use_cases").update({ red_team_at: new Date().toISOString() }).eq("org_id", orgId).eq("id", useCaseId);
      await recordUsage(orgId, generated.usage.inputTokens, generated.usage.outputTokens);
      await recordUsageEvent(orgId, { useCaseId, stage: "red_team", model: ENGINE_MODELS.deep, inputTokens: generated.usage.inputTokens, outputTokens: generated.usage.outputTokens });
      await logAudit({ orgId, actor: userId, action: "redteam.run", objectType: "use_case", objectId: useCaseId, detail: { attacks: rows.length } });
      await sb.from("engine_jobs").update({ status: "done", finished_at: new Date().toISOString() }).eq("id", jobId);
    });

    return { ok: true, count: generated.attacks.length };
  }
);

/**
 * Vendor AI Review: one-shot classify/tier + tier-scaled vendor question pack
 * for a third-party AI product (pre-purchase). Durable so the heavy Opus
 * generation runs well past the request timeout. Enterprise + Reviewer.
 */
