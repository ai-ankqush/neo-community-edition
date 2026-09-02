import { NextResponse } from "next/server";
import { requireSession, ApiError } from "@/lib/rbac";
import { ensureOrg } from "@/lib/org";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic"; // never cache the notifications feed

/** GET /api/jobs - recent engine jobs for the org (notifications feed). */
export async function GET() {
  try {
    const session = await requireSession();
    const orgId = await ensureOrg(session.orgId);
    const sb = supabaseAdmin();

    const [{ data: jobs }, { count }] = await Promise.all([
      sb.from("engine_jobs")
        .select("id, use_case_id, vendor_review_id, use_case_name, stage, status, error, read, created_at, finished_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(15),
      sb.from("engine_jobs")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("read", false)
        .in("status", ["done", "failed"]),
    ]);

    return NextResponse.json({ jobs: jobs ?? [], unread: count ?? 0 });
  } catch (err) {
    if (err instanceof ApiError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
