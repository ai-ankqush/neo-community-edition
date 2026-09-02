import { NextRequest, NextResponse } from "next/server";
import { requireRole, ApiError } from "@/lib/rbac";
import { supabaseAdmin } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { fireStep, signalsFromUseCase, StepError } from "@/server/red-team/run";
import type { TargetMethod } from "@/server/red-team/connect";

export const maxDuration = 60;

const METHODS: TargetMethod[] = ["endpoint", "public", "mcp"];

/**
 * Fire ONE Live Fire step. The human drove here — the console previewed the step
 * and the user clicked Proceed (or, for a dangerous step, typed the confirmation
 * and acknowledged). `confirmed` carries that acknowledgement; the server enforces
 * it for dangerous steps (428 if missing).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole("org_admin", "assessor");
    const orgId = session.internalOrgId;
    const { id: runId } = await ctx.params;
    const sb = supabaseAdmin();
    const body = await req.json().catch(() => ({} as Record<string, unknown>));

    const index = Number(body.index);
    if (!Number.isInteger(index) || index < 0) throw new ApiError(400, "Bad step index");
    const method = (METHODS.includes(body.target_method as TargetMethod) ? body.target_method : "endpoint") as TargetMethod;
    const url = typeof body.target_url === "string" ? body.target_url.trim() : null;
    const useCaseId = typeof body.use_case_id === "string" && body.use_case_id ? body.use_case_id : null;
    const confirmed = body.confirmed === true;

    if ((method === "endpoint" || method === "public" || method === "mcp") && !url) {
      throw new ApiError(400, "A target URL is required (the endpoint, public, or MCP-server URL).");
    }

    let signals = signalsFromUseCase({});
    if (useCaseId) {
      const { data: uc } = await sb.from("use_cases").select("id, name, description").eq("org_id", orgId).eq("id", useCaseId).maybeSingle();
      if (uc) signals = signalsFromUseCase(uc);
    }

    const out = await fireStep({ orgId, runId, signals, target: { method, url }, index, confirmed });

    if (out.done) await logAudit({ orgId, actor: session.userId, action: "red_team.live_fire_complete", objectType: "red_team_run", objectId: runId });

    return NextResponse.json(out);
  } catch (err) {
    if (err instanceof StepError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("live fire step failed", err);
    return NextResponse.json({ error: "Step failed — please try again." }, { status: 500 });
  }
}
