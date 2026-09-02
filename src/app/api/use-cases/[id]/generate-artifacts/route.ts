import { NextResponse } from "next/server";
import { requireRole, ApiError } from "@/lib/rbac";
import { supabaseAdmin } from "@/lib/supabase";
import { planFor } from "@/lib/plans";
import { inngest } from "@/lib/inngest";

export const maxDuration = 30;

/** POST /api/use-cases/:id/generate-artifacts - kick off per-control code
 *  generation (Premium+). Returns a job id the UI polls via /api/jobs/:id. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireRole("org_admin", "assessor");
    const sb = supabaseAdmin();

    const { data: org } = await sb.from("organizations").select("plan").eq("id", session.internalOrgId).single();
    if (!planFor(org?.plan).codeGeneration) {
      throw new ApiError(402, "Code artifact generation is available on the Starter and Enterprise plans.");
    }

    const [{ count }, { data: uc }] = await Promise.all([
      sb.from("control_items").select("id", { count: "exact", head: true }).eq("org_id", session.internalOrgId).eq("use_case_id", id),
      sb.from("use_cases").select("name").eq("org_id", session.internalOrgId).eq("id", id).maybeSingle(),
    ]);
    if (!uc) throw new ApiError(404, "Use case not found");
    if ((count ?? 0) === 0) throw new ApiError(400, "Complete the Controls stage first.");

    const { data: job, error } = await sb
      .from("engine_jobs")
      .insert({ org_id: session.internalOrgId, use_case_id: id, use_case_name: uc.name, stage: "artifacts", status: "queued", created_by: session.userId })
      .select("id")
      .single();
    if (error) throw error;

    await inngest.send({
      name: "engine/artifacts.requested",
      data: { jobId: job.id, orgId: session.internalOrgId, useCaseId: id, userId: session.userId },
    });

    return NextResponse.json({ jobId: job.id, status: "queued" });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("GENERATE ARTIFACTS ERROR", err);
    return NextResponse.json({ error: "Could not start generation" }, { status: 500 });
  }
}
