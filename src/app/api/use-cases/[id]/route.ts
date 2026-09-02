import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, requireRole, ApiError } from "@/lib/rbac";
import { ensureOrg } from "@/lib/org";
import { supabaseAdmin } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { STAGES, nextStage, canAdvance, type Stage } from "@/lib/types/stages";
import { planFor } from "@/lib/plans";
import { withFrameworkFallback } from "@/lib/framework-fallback";
import { safeCapabilityForControl } from "@/server/fabric/control-capability-map";

const Patch = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update"),
    name: z.string().min(2).max(200).optional(),
    description: z.string().max(5000).optional(),
    status: z.enum(["active", "archived"]).optional(),
    businessFunction: z.string().max(60).optional(),
    ownerName: z.string().max(120).optional(),
    ownerEmail: z.string().max(160).optional(),
    stack: z
      .object({
        products: z
          .array(
            z.object({
              category: z.string().max(50),
              name: z.string().max(100),
              services: z.array(z.string().max(100)).optional(),
              capability: z.string().max(50).optional(),
            })
          )
          .max(100),
        other: z.string().max(1000).optional(),
      })
      .optional(),
  }),
  z.object({
    action: z.literal("advance"),
    acceptedDraft: z.unknown().optional(), // stage output the human accepted
    editsMade: z.boolean().optional().default(false),
  }),
  z.object({
    action: z.literal("back"),
  }),
  z.object({
    action: z.literal("rewind_to"),
    targetStage: z.string(),
  }),
]);

/** Undo everything a stage's acceptance materialized. Returns use_case field resets. */
async function cleanupStage(
  sb: ReturnType<typeof supabaseAdmin>,
  orgId: string,
  useCaseId: string,
  stage: string
): Promise<Record<string, unknown>> {
  await sb.from("stage_records").delete()
    .eq("org_id", orgId).eq("use_case_id", useCaseId).eq("stage", stage);

  const patch: Record<string, unknown> = {};
  if (stage === "classify") patch.patterns = [];
  if (stage === "tier") { patch.tier = null; patch.scope_lock = {}; }
  if (stage === "questions")
    await sb.from("questions").delete().eq("org_id", orgId).eq("use_case_id", useCaseId);
  // control_items / evidence_items / assurance_tests / conditions are NOT deleted
  // here. Re-accepting the stage replaces their content while preserving any
  // human-set status (implementation status, verification, evidence state,
  // assurance result, condition closure). See the materialization step.
  if (stage === "decision")
    await sb.from("approvals").delete().eq("org_id", orgId).eq("use_case_id", useCaseId);
  return patch;
}

type Params = { params: Promise<{ id: string }> };

/** GET /api/use-cases/:id - detail + stage history */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const session = await requireSession();
    const orgId = await ensureOrg(session.orgId);
    const sb = supabaseAdmin();

    const { data: uc, error } = await sb
      .from("use_cases")
      .select("*")
      .eq("org_id", orgId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!uc) throw new ApiError(404, "Use case not found");

    const { data: stages } = await sb
      .from("stage_records")
      .select("stage, accepted_output, accepted_by, accepted_at, edits_made")
      .eq("org_id", orgId)
      .eq("use_case_id", id)
      .order("created_at", { ascending: true });

    return NextResponse.json({ useCase: uc, stageRecords: stages ?? [] });
  } catch (err) {
    return handle(err);
  }
}

/** PATCH /api/use-cases/:id - update fields or advance the stage gate */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const session = await requireRole("org_admin", "assessor");
    const orgId = await ensureOrg(session.orgId);
    const body = Patch.parse(await req.json());
    const sb = supabaseAdmin();

    const { data: uc, error } = await sb
      .from("use_cases")
      .select("id, stage, name")
      .eq("org_id", orgId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!uc) throw new ApiError(404, "Use case not found");

    if (body.action === "update") {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.name !== undefined) patch.name = body.name;
      if (body.description !== undefined) patch.description = body.description;
      if (body.status !== undefined) patch.status = body.status;
      if (body.businessFunction !== undefined) patch.business_function = body.businessFunction || null;
      if (body.ownerName !== undefined) patch.owner_name = body.ownerName || null;
      if (body.ownerEmail !== undefined) patch.owner_email = body.ownerEmail || null;
      if (body.stack !== undefined) {
        // server-side plan cap on stack products
        const { data: orgRow } = await sb
          .from("organizations").select("plan").eq("id", orgId).single();
        const limits = planFor(orgRow?.plan);
        if (!limits.stackAwareControls) {
          throw new ApiError(402, "Stack-aware controls are not included in your plan. Upgrade to Starter or above.");
        }
        if (body.stack.products.length > limits.techProductLimit) {
          throw new ApiError(
            402,
            `Your plan allows up to ${limits.techProductLimit} tech products. Upgrade for unlimited stack mapping.`
          );
        }
        patch.stack = body.stack;
      }

      const { data: updated, error: upErr } = await sb
        .from("use_cases")
        .update(patch)
        .eq("org_id", orgId)
        .eq("id", id)
        .select()
        .single();
      if (upErr) throw upErr;

      await logAudit({
        orgId, actor: session.userId, action: "use_case.update",
        objectType: "use_case", objectId: id, detail: patch,
      });
      return NextResponse.json({ useCase: updated });
    }

    if (body.action === "back" || body.action === "rewind_to") {
      // Rewind: un-accept stages back to the target, cleaning up everything
      // they materialized, so they can be redone coherently.
      const cur = uc.stage as Stage;
      const idx = STAGES.indexOf(cur);
      if (idx <= 0) throw new ApiError(400, "Already at the first stage");

      const target =
        body.action === "back"
          ? STAGES[idx - 1]
          : (body.targetStage as Stage);
      const targetIdx = STAGES.indexOf(target);
      if (targetIdx < 0 || targetIdx >= idx)
        throw new ApiError(400, "Target stage must be earlier than the current stage");

      // Clean every stage from target up to (and including) the current one -
      // downstream outputs derived from a re-done stage must not survive it.
      const ucPatch: Record<string, unknown> = {
        stage: target,
        updated_at: new Date().toISOString(),
      };
      for (let i = idx; i >= targetIdx; i--) {
        Object.assign(ucPatch, await cleanupStage(sb, orgId, id, STAGES[i]));
      }

      const { data: updated, error: backErr } = await sb
        .from("use_cases").update(ucPatch)
        .eq("org_id", orgId).eq("id", id).select().single();
      if (backErr) throw backErr;

      await logAudit({
        orgId, actor: session.userId, action: "stage.rewind",
        objectType: "use_case", objectId: id,
        detail: { from: cur, to: target },
      });
      return NextResponse.json({ useCase: updated });
    }

    // action === "advance": confirm the current stage gate, move to next
    const current = uc.stage as Stage;
    if (!canAdvance(session.role, current)) {
      throw new ApiError(403, `Role '${session.role}' cannot confirm the '${current}' gate`);
    }
    const next = nextStage(current);
    if (!next) throw new ApiError(400, "Already at the final stage");

    // record the accepted stage output (human-owned record)
    const { error: srErr } = await sb.from("stage_records").insert({
      org_id: orgId,
      use_case_id: id,
      stage: current,
      accepted_output: body.acceptedDraft ?? null,
      edits_made: body.editsMade,
      accepted_by: session.userId,
      accepted_at: new Date().toISOString(),
    });
    if (srErr) throw srErr;

    // tier lands on the use case record when the tier stage is accepted
    const patch: Record<string, unknown> = {
      stage: next,
      updated_at: new Date().toISOString(),
    };
    const draft = body.acceptedDraft as Record<string, unknown> | undefined;
    if (current === "tier" && draft && typeof draft.tier === "number") {
      patch.tier = draft.tier;
      if (draft.escalationTriggers) patch.scope_lock = { triggers: draft.escalationTriggers };
    }
    if (current === "classify" && draft && Array.isArray(draft.patterns)) {
      patch.patterns = draft.patterns;
    }

    // Materialize accepted stage outputs into workable rows
    if (current === "questions" && draft && Array.isArray(draft.questions)) {
      const rows = (draft.questions as { question: string; block?: string }[]).map((q) => ({
        org_id: orgId,
        use_case_id: id,
        stage: "questions",
        text: q.question,
        status: "open",
      }));
      if (rows.length) {
        const { error: qErr } = await sb.from("questions").insert(rows);
        if (qErr) throw qErr;
      }
    }
    if (current === "controls" && draft && Array.isArray(draft.controls)) {
      // preserve human-set status + verification across re-materialization
      const { data: prevC } = await sb.from("control_items")
        .select("pillar, control, status, verification_status, verification_note, verified_at")
        .eq("org_id", orgId).eq("use_case_id", id);
      const prevByKey = new Map((prevC ?? []).map((c) => [`${c.pillar}::${c.control}`, c]));
      await sb.from("control_items").delete().eq("org_id", orgId).eq("use_case_id", id);

      const rows = (draft.controls as {
        pillar: number; control: string; why?: string; requirement?: string;
        frameworks?: Record<string, string>;
        stackImplementation?: string; evidence?: string; assuranceTest?: string;
      }[])
        // guard against malformed model output: pillar must be 1-10 and control non-empty
        // (control_items enforces both at the DB level, so a stray row would 500 the whole insert)
        .filter((c) =>
          c.requirement !== "n/a" &&
          typeof c.pillar === "number" && c.pillar >= 1 && c.pillar <= 10 &&
          typeof c.control === "string" && c.control.trim().length > 0
        )
        .map((c) => {
          const p = prevByKey.get(`${c.pillar}::${c.control}`);
          return {
            org_id: orgId,
            use_case_id: id,
            pillar: c.pillar,
            control: c.control,
            why: c.why ?? null,
            requirement: c.requirement ?? "required",
            status: p?.status ?? "gap",
            verification_status: p?.verification_status ?? "not_checked",
            verification_note: p?.verification_note ?? null,
            verified_at: p?.verified_at ?? null,
            framework_refs: withFrameworkFallback(c.pillar, c.frameworks),
            stack_implementation: c.stackImplementation ?? null,
            evidence: c.evidence ?? null,
            assurance_test: c.assuranceTest ?? null,
            capability_id: safeCapabilityForControl(c.pillar, c.control),
          };
        });
      if (rows.length) {
        const { error: cErr } = await sb.from("control_items").insert(rows);
        if (cErr) throw cErr;
      }
    }

    if (current === "evidence" && draft && Array.isArray(draft.evidenceRequests)) {
      const { data: prevE } = await sb.from("evidence_items")
        .select("title, status").eq("org_id", orgId).eq("use_case_id", id);
      const prevStatus = new Map((prevE ?? []).map((e) => [e.title, e.status]));
      await sb.from("evidence_items").delete().eq("org_id", orgId).eq("use_case_id", id);

      const rows = (draft.evidenceRequests as { item: string }[]).map((e) => ({
        org_id: orgId,
        use_case_id: id,
        title: e.item,
        source: "manual",
        status: prevStatus.get(e.item) ?? "requested",
      }));
      if (rows.length) {
        const { error: eErr } = await sb.from("evidence_items").insert(rows);
        if (eErr) throw eErr;
      }
    }
    if (current === "assurance" && draft && Array.isArray(draft.tests)) {
      const { data: prevT } = await sb.from("assurance_tests")
        .select("objective, result").eq("org_id", orgId).eq("use_case_id", id);
      const prevResult = new Map((prevT ?? []).map((t) => [t.objective, t.result]));
      await sb.from("assurance_tests").delete().eq("org_id", orgId).eq("use_case_id", id);

      const rows = (draft.tests as {
        objective: string; method?: string; expected?: string; suggestedOwner?: string;
      }[]).map((t) => ({
        org_id: orgId,
        use_case_id: id,
        objective: t.objective,
        method: t.method ?? null,
        expected: t.expected ?? null,
        owner: t.suggestedOwner ?? null,
        result: prevResult.get(t.objective) ?? "not_started",
      }));
      if (rows.length) {
        const { error: tErr } = await sb.from("assurance_tests").insert(rows);
        if (tErr) throw tErr;
      }
    }
    if (current === "decision" && draft && typeof draft.recommendation === "string") {
      const { error: aErr } = await sb.from("approvals").insert({
        org_id: orgId,
        use_case_id: id,
        decision: draft.recommendation,
        rationale: (draft.executiveRationale as string) ?? null,
        approver: session.userId,
      });
      if (aErr) throw aErr;
      if (Array.isArray(draft.conditions)) {
        const { data: prevCond } = await sb.from("conditions")
          .select("text, status").eq("org_id", orgId).eq("use_case_id", id);
        const prevCondStatus = new Map((prevCond ?? []).map((c) => [c.text, c.status]));
        await sb.from("conditions").delete().eq("org_id", orgId).eq("use_case_id", id);

        const rows = (draft.conditions as {
          condition: string; suggestedOwner?: string; consequence?: string;
        }[]).map((c) => ({
          org_id: orgId,
          use_case_id: id,
          text: c.condition,
          owner: c.suggestedOwner ?? null,
          consequence: c.consequence ?? null,
          status: prevCondStatus.get(c.condition) ?? "open",
        }));
        if (rows.length) {
          const { error: cErr } = await sb.from("conditions").insert(rows);
          if (cErr) throw cErr;
        }
      }
    }

    const { data: updated, error: advErr } = await sb
      .from("use_cases")
      .update(patch)
      .eq("org_id", orgId)
      .eq("id", id)
      .select()
      .single();
    if (advErr) throw advErr;

    await logAudit({
      orgId, actor: session.userId, action: "stage.gate_confirm",
      objectType: "use_case", objectId: id,
      detail: { from: current, to: next, editsMade: body.editsMade },
    });

    return NextResponse.json({ useCase: updated });
  } catch (err) {
    return handle(err);
  }
}

/** DELETE /api/use-cases/:id (org_admin only).
 *  Before any engine generation: hard delete (free - no slot consumed).
 *  After consumption: ARCHIVE instead - the record is retained and the
 *  slot stays used this period. Delete never refunds a slot. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const session = await requireRole("org_admin");
    const orgId = await ensureOrg(session.orgId);
    const sb = supabaseAdmin();

    const { data: uc } = await sb
      .from("use_cases")
      .select("id, name")
      .eq("org_id", orgId)
      .eq("id", id)
      .maybeSingle();
    if (!uc) throw new ApiError(404, "Use case not found");

    const { data: consumed } = await sb
      .from("slot_consumptions")
      .select("id")
      .eq("org_id", orgId)
      .eq("use_case_id", id)
      .maybeSingle();

    if (consumed) {
      // assessed use cases are archived, not destroyed - the audit trail
      // (and the consumed slot) survive
      const { error } = await sb
        .from("use_cases")
        .update({ status: "archived", updated_at: new Date().toISOString() })
        .eq("org_id", orgId)
        .eq("id", id);
      if (error) throw error;

      await logAudit({
        orgId, actor: session.userId, action: "use_case.archive",
        objectType: "use_case", objectId: id, detail: { name: uc.name },
      });
      return NextResponse.json({ archived: true });
    }

    const { error } = await sb
      .from("use_cases")
      .delete()
      .eq("org_id", orgId)
      .eq("id", id);
    if (error) throw error;

    await logAudit({
      orgId, actor: session.userId, action: "use_case.delete",
      objectType: "use_case", objectId: id, detail: { name: uc.name },
    });

    return NextResponse.json({ deleted: true });
  } catch (err) {
    return handle(err);
  }
}

function handle(err: unknown) {
  if (err instanceof ApiError)
    return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof z.ZodError)
    return NextResponse.json({ error: err.issues }, { status: 400 });
  console.error(err);
  // surface the real message so beta issues are diagnosable (Supabase/PG errors include a `message`)
  const msg = err instanceof Error ? err.message : (err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : "Internal error");
  return NextResponse.json({ error: msg || "Internal error" }, { status: 500 });
}
