import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, ApiError } from "@/lib/rbac";
import { ensureOrg } from "@/lib/org";
import { supabaseAdmin } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";

const AnswerBody = z.object({
  answer: z.string().max(10000).optional(),
  notApplicable: z.boolean().optional(),
});

/** PATCH /api/questions/:id - answer a question (contributor and up) */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await requireRole("org_admin", "assessor", "contributor");
    const orgId = await ensureOrg(session.orgId);
    const body = AnswerBody.parse(await req.json());

    if (!body.notApplicable && !body.answer?.trim()) {
      throw new ApiError(400, "Provide an answer or mark the question not applicable.");
    }

    const { data, error } = await supabaseAdmin()
      .from("questions")
      .update({
        answer: body.notApplicable ? null : body.answer,
        answered_by: session.userId,
        status: body.notApplicable ? "not_applicable" : "answered",
      })
      .eq("org_id", orgId)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    if (!data) throw new ApiError(404, "Question not found");

    // mark context as changed so downstream stages can be flagged for re-assessment
    if (data.use_case_id) {
      await supabaseAdmin()
        .from("use_cases")
        .update({ context_updated_at: new Date().toISOString() })
        .eq("org_id", orgId)
        .eq("id", data.use_case_id);
    }

    await logAudit({
      orgId,
      actor: session.userId,
      action: "question.answer",
      objectType: "question",
      objectId: id,
    });

    return NextResponse.json({ question: data });
  } catch (err) {
    if (err instanceof ApiError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError)
      return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
