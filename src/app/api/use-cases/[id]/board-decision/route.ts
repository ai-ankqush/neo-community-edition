import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, ApiError } from "@/lib/rbac";
import { supabaseAdmin } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { planFor } from "@/lib/plans";

/**
 * POST /api/use-cases/:id/board-decision - record the human governance
 * verdict (Architecture Review Board style). Independent of, and recorded
 * alongside, the engine's recommendation. Org admins only - this is the
 * accountable human signing the decision.
 */

const Body = z.object({
  verdict: z.enum([
    "approved",
    "approved_with_conditions",
    "pilot_only_strict_controls",
    "rejected_pending_technology",
    "rejected",
  ]),
  rationale: z.string().min(10).max(5000),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await requireRole("org_admin");
    const body = Body.parse(await req.json());
    const sb = supabaseAdmin();

    const { data: orgRow } = await sb
      .from("organizations").select("plan").eq("id", session.internalOrgId).single();
    if (planFor(orgRow?.plan).decisionBoard === "view") {
      throw new ApiError(402, "Recording board decisions requires Starter or above.");
    }

    const { data: uc } = await sb
      .from("use_cases")
      .select("id, name")
      .eq("org_id", session.internalOrgId)
      .eq("id", id)
      .maybeSingle();
    if (!uc) throw new ApiError(404, "Use case not found");

    const { data, error } = await sb
      .from("board_decisions")
      .insert({
        org_id: session.internalOrgId,
        use_case_id: id,
        verdict: body.verdict,
        rationale: body.rationale,
        decided_by: session.userId,
      })
      .select()
      .single();
    if (error) throw error;

    await logAudit({
      orgId: session.internalOrgId,
      actor: session.userId,
      action: "board.decision",
      objectType: "use_case",
      objectId: id,
      detail: { verdict: body.verdict },
    });

    return NextResponse.json({ decision: data });
  } catch (err) {
    if (err instanceof ApiError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError)
      return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
