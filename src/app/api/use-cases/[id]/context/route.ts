import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, ApiError } from "@/lib/rbac";
import { supabaseAdmin } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";

const Body = z.object({ note: z.string().min(2).max(5000) });

/** POST /api/use-cases/:id/context - add a free-form context note at any stage.
 *  Marks the use case's context as changed so stages can be re-assessed. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireRole("org_admin", "assessor", "contributor");
    const { note } = Body.parse(await req.json());
    const sb = supabaseAdmin();

    const { data: uc } = await sb.from("use_cases").select("id").eq("org_id", session.internalOrgId).eq("id", id).maybeSingle();
    if (!uc) throw new ApiError(404, "Use case not found");

    const { error } = await sb.from("context_entries").insert({
      org_id: session.internalOrgId,
      use_case_id: id,
      note,
      created_by: session.userId,
    });
    if (error) throw error;

    await sb.from("use_cases").update({ context_updated_at: new Date().toISOString() }).eq("org_id", session.internalOrgId).eq("id", id);

    await logAudit({ orgId: session.internalOrgId, actor: session.userId, action: "context.add", objectType: "use_case", objectId: id });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error("CONTEXT ADD ERROR", err);
    return NextResponse.json({ error: "Could not add context" }, { status: 500 });
  }
}
