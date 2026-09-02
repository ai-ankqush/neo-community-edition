import { NextRequest, NextResponse } from "next/server";
import { requireRole, ApiError } from "@/lib/rbac";
import { supabaseAdmin } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { inngest } from "@/lib/inngest";
import { byokEnabled, resolveModelAccess } from "@/server/model/provider";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** POST /api/onboarding/first-use-case — the concierge's magic moment.
 *  Creates the user's first use case from their concern and queues the
 *  classify stage on the durable engine. Marks them welcomed. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole("org_admin", "assessor");
    const orgId = session.internalOrgId;

    // BYO orgs (Community) must have a model key before their first run.
    if (byokEnabled()) {
      const access = await resolveModelAccess(orgId);
      if (!access.managed && !access.ready) {
        return NextResponse.json(
          { error: "Add your model provider key in Settings before running an assessment.", code: "byo_key_required" },
          { status: 400 },
        );
      }
    }

    const body = await req.json().catch(() => ({}));
    const concern = String(body.concern ?? "").trim();
    const role = String(body.role ?? "").trim().slice(0, 60);
    if (concern.length < 4) throw new ApiError(400, "Tell Neo a bit more about the AI system.");

    const name = concern.length > 80 ? concern.slice(0, 77) + "…" : concern;
    const sb = supabaseAdmin();

    const { data: uc, error: ucErr } = await sb
      .from("use_cases")
      .insert({ org_id: orgId, name, description: concern, created_by: session.userId })
      .select("id, name")
      .single();
    if (ucErr) throw ucErr;

    // remember role/concern + mark the concierge done
    await sb.from("user_onboarding").upsert(
      { user_id: session.userId, org_id: orgId, role, concern, welcomed_at: new Date().toISOString() },
      { onConflict: "user_id,org_id" },
    );

    // queue the first stage on the durable worker
    const { data: job, error: jobErr } = await sb
      .from("engine_jobs")
      .insert({ org_id: orgId, use_case_id: uc.id, use_case_name: uc.name, stage: "classify", status: "queued", created_by: session.userId })
      .select("id").single();
    if (jobErr) throw jobErr;

    await inngest.send({
      name: "engine/stage.requested",
      data: { jobId: job.id, orgId, useCaseId: uc.id, stage: "classify", userId: session.userId, input: { name: uc.name, description: concern } },
    });

    await logAudit({ orgId, actor: session.userId, action: "use_case.create", objectType: "use_case", objectId: uc.id, detail: { via: "concierge" } });

    return NextResponse.json({ useCaseId: uc.id, jobId: job.id });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("CONCIERGE FIRST UC ERROR", err);
    return NextResponse.json({ error: "Could not start your first assessment" }, { status: 500 });
  }
}
