import { NextRequest, NextResponse } from "next/server";
import { requireSession, ApiError } from "@/lib/rbac";
import { ensureOrg } from "@/lib/org";
import { supabaseAdmin } from "@/lib/supabase";

type Params = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic"; // never cache job status — the poll needs live data

/** GET /api/jobs/:id - poll a single job (returns draft when done). */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const session = await requireSession();
    const orgId = await ensureOrg(session.orgId);

    const { data: job, error } = await supabaseAdmin()
      .from("engine_jobs")
      .select("id, stage, status, draft, error, use_case_id")
      .eq("org_id", orgId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!job) throw new ApiError(404, "Job not found");

    return NextResponse.json({ job });
  } catch (err) {
    if (err instanceof ApiError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/** PATCH /api/jobs/:id - mark read. */
export async function PATCH(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const session = await requireSession();
    const orgId = await ensureOrg(session.orgId);

    await supabaseAdmin()
      .from("engine_jobs")
      .update({ read: true })
      .eq("org_id", orgId)
      .eq("id", id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
