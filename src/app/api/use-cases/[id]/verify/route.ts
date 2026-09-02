import { NextRequest, NextResponse } from "next/server";
import { requireRole, ApiError } from "@/lib/rbac";
import { supabaseAdmin } from "@/lib/supabase";
import { runCapabilityCheck } from "@/server/fabric/registry";
import { requireFabricEnabled } from "@/server/fabric/gate";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** POST /api/use-cases/:id/verify — run a fabric capability check against the
 *  org's connected system and store the result as control_evidence.
 *  Body: { capabilityId?, params? }. Defaults to the AI-BOM check. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole("org_admin", "assessor");
    await requireFabricEnabled(session.internalOrgId);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const capabilityId = String(body.capabilityId ?? "ai_bom_present_and_valid");

    const sb = supabaseAdmin();
    const { data: uc } = await sb
      .from("use_cases").select("id").eq("org_id", session.internalOrgId).eq("id", id).maybeSingle();
    if (!uc) throw new ApiError(404, "Use case not found");

    const { check, evidenceId, provider } = await runCapabilityCheck({
      orgId: session.internalOrgId,
      capabilityId,
      useCaseId: id,
      actor: session.userId,
      params: body.params ?? {},
    });

    return NextResponse.json({ check, evidenceId, provider });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("VERIFY ERROR", err);
    return NextResponse.json({ error: "Could not run verification" }, { status: 500 });
  }
}
