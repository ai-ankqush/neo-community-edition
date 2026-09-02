import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, ApiError } from "@/lib/rbac";
import { supabaseAdmin } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";

/** Mark a Red Team finding's control as in place (manual override), or revert to the
 *  auto-derived status. Keyed by the finding's stable identity so it survives re-runs. */

const Body = z.object({
  useCaseId: z.string().uuid(),
  vector: z.string().min(1).max(40),
  technique: z.string().min(1).max(300),
  addressed: z.boolean(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole("org_admin");
    const sb = supabaseAdmin();
    const b = Body.parse(await req.json());

    if (b.addressed) {
      const { error } = await sb.from("red_team_overrides").upsert({
        org_id: session.internalOrgId, use_case_id: b.useCaseId, vector: b.vector, technique: b.technique,
        addressed: true, updated_by: session.userId, updated_at: new Date().toISOString(),
      }, { onConflict: "org_id,use_case_id,vector,technique" });
      if (error) throw new ApiError(500, error.message);
    } else {
      // revert to the auto-derived status
      const { error } = await sb.from("red_team_overrides").delete()
        .eq("org_id", session.internalOrgId).eq("use_case_id", b.useCaseId).eq("vector", b.vector).eq("technique", b.technique);
      if (error) throw new ApiError(500, error.message);
    }

    await logAudit({
      orgId: session.internalOrgId, actor: session.userId,
      action: "red_team.control_marked",
      objectType: "use_case", objectId: b.useCaseId,
      detail: { vector: b.vector, technique: b.technique, addressed: b.addressed },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error("RED TEAM ADDRESS ERROR", err);
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }
}
