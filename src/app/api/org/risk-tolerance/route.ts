import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, ApiError } from "@/lib/rbac";
import { supabaseAdmin } from "@/lib/supabase";
import { normalizeTargets } from "@/lib/risk-tolerance";

export const dynamic = "force-dynamic";

/** POST /api/org/risk-tolerance — set the org's per-tier acceptable coverage targets.
 *  Admin only. The coverage bars across the dashboards colour against these. */
const Body = z.object({
  targets: z.record(z.string(), z.number().min(0).max(100)),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole("org_admin");
    const b = Body.parse(await req.json());
    const targets = normalizeTargets(b.targets);
    const { error } = await supabaseAdmin()
      .from("organizations")
      .update({ risk_tolerance: targets })
      .eq("id", session.internalOrgId);
    if (error) throw new ApiError(500, "Could not save targets");
    return NextResponse.json({ ok: true, targets });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error("RISK TOLERANCE SAVE ERROR", err);
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
}
