import { NextRequest, NextResponse } from "next/server";
import { requireRole, ApiError } from "@/lib/rbac";
import { supabaseAdmin } from "@/lib/supabase";
import { requireFabricEnabled } from "@/server/fabric/gate";
import { runCapabilityCheck } from "@/server/fabric/registry";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** POST /api/controls/:id/verify — run the live check for a single control via
 *  its tagged capability and the org's connected provider; records control_evidence. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole("org_admin", "assessor");
    await requireFabricEnabled(session.internalOrgId);
    const { id } = await params;
    const sb = supabaseAdmin();

    const { data: control } = await sb
      .from("control_items").select("id, use_case_id, capability_id")
      .eq("org_id", session.internalOrgId).eq("id", id).maybeSingle();
    if (!control) throw new ApiError(404, "Control not found");
    if (!control.capability_id) throw new ApiError(400, "This control isn't auto-verifiable.");

    const { check, evidenceId, provider } = await runCapabilityCheck({
      orgId: session.internalOrgId,
      capabilityId: control.capability_id,
      useCaseId: control.use_case_id,
      controlId: control.id,
      actor: session.userId,
    });

    // Propagate the live result to the control's status — a proven control IS implemented.
    // A pass marks it Ready + Verified; partial/fail set the verification badge but never
    // upgrade the implementation status (proof, not optimism).
    const patch: Record<string, unknown> = {};
    if (check.result === "pass") {
      patch.status = "in_place";
      patch.verification_status = "verified";
      patch.verified_at = new Date().toISOString();
    } else if (check.result === "partial") {
      patch.verification_status = "partial";
    } else if (check.result === "fail") {
      patch.verification_status = "missing";
    }
    if (Object.keys(patch).length) {
      await sb.from("control_items").update(patch).eq("org_id", session.internalOrgId).eq("id", control.id);
    }

    return NextResponse.json({ check, evidenceId, provider });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("CONTROL VERIFY ERROR", err);
    return NextResponse.json({ error: "Could not verify control" }, { status: 500 });
  }
}
