import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, ApiError } from "@/lib/rbac";
import { supabaseAdmin } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";

/** PATCH /api/tests/:id - update assurance test status + optional evidence link. */
const Body = z.object({
  result: z.enum(["not_started", "in_progress", "passed", "failed"]).optional(),
  evidenceUrl: z.string().max(2000).optional(),
}).refine((b) => b.result !== undefined || b.evidenceUrl !== undefined, { message: "Provide result or evidenceUrl" });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await requireRole("org_admin", "assessor");
    const body = Body.parse(await req.json());

    const patch: Record<string, unknown> = {};
    if (body.result !== undefined) {
      patch.result = body.result;
      patch.run_at = body.result === "passed" || body.result === "failed" ? new Date().toISOString() : null;
    }
    if (body.evidenceUrl !== undefined) patch.evidence_url = body.evidenceUrl || null;

    const { data, error } = await supabaseAdmin()
      .from("assurance_tests")
      .update(patch)
      .eq("org_id", session.internalOrgId)
      .eq("id", id)
      .select("id")
      .single();
    if (error) throw error;
    if (!data) throw new ApiError(404, "Test not found");

    await logAudit({
      orgId: session.internalOrgId,
      actor: session.userId,
      action: "test.status",
      objectType: "assurance_test",
      objectId: id,
      detail: { result: body.result, evidence: Boolean(body.evidenceUrl) },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError)
      return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
