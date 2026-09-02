import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, ApiError } from "@/lib/rbac";
import { supabaseAdmin } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";

const Body = z.object({ status: z.enum(["open", "closed"]) });

/** PATCH /api/conditions/:id - open/close an approval condition (admin/assessor). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireRole("org_admin", "assessor");
    const { status } = Body.parse(await req.json());

    const { data, error } = await supabaseAdmin()
      .from("conditions")
      .update({ status })
      .eq("org_id", session.internalOrgId)
      .eq("id", id)
      .select("id")
      .single();
    if (error) throw error;
    if (!data) throw new ApiError(404, "Condition not found");

    await logAudit({
      orgId: session.internalOrgId, actor: session.userId,
      action: "condition.status", objectType: "condition", objectId: id, detail: { status },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
