import { NextResponse } from "next/server";
import { requireRole, ApiError } from "@/lib/rbac";
import { supabaseAdmin } from "@/lib/supabase";
import { entitlementsFor } from "@/lib/plans";
import { inngest } from "@/lib/inngest";

export const maxDuration = 30;

/** POST /api/use-cases/:id/red-team - run Red Team attack-path analysis
 *  (Enterprise). Returns a job id the UI polls via /api/jobs/:id. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireRole("org_admin", "assessor");
    const sb = supabaseAdmin();

    const { data: org } = await sb.from("organizations").select("plan, entitlement_overrides, suspended").eq("id", session.internalOrgId).single();
    if (org?.suspended) throw new ApiError(403, "This account is suspended. Contact your administrator.");
    if (!entitlementsFor(org?.plan, org?.entitlement_overrides).redTeam) {
      throw new ApiError(402, "Red Team is not enabled for your account.");
    }

    const { data: uc } = await sb.from("use_cases").select("name, tier").eq("org_id", session.internalOrgId).eq("id", id).maybeSingle();
    if (!uc) throw new ApiError(404, "Use case not found");
    if (!uc.tier) throw new ApiError(400, "Run the assessment through risk tiering first.");

    const { data: job, error } = await sb
      .from("engine_jobs")
      .insert({ org_id: session.internalOrgId, use_case_id: id, use_case_name: uc.name, stage: "red_team", status: "queued", created_by: session.userId })
      .select("id")
      .single();
    if (error) throw error;

    await inngest.send({
      name: "engine/redteam.requested",
      data: { jobId: job.id, orgId: session.internalOrgId, useCaseId: id, userId: session.userId },
    });

    return NextResponse.json({ jobId: job.id, status: "queued" });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("RED TEAM ERROR", err);
    return NextResponse.json({ error: "Could not start Red Team" }, { status: 500 });
  }
}
