import { NextRequest, NextResponse } from "next/server";
import { requireRole, ApiError } from "@/lib/rbac";
import { supabaseAdmin } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { createRun, signalsFromUseCase } from "@/server/red-team/run";
import type { TargetMethod } from "@/server/red-team/connect";
import type { BatteryKey } from "@/server/red-team/batteries";

const METHODS: TargetMethod[] = ["endpoint", "public", "mcp"];
const BATTERY_KEYS: BatteryKey[] = ["prompt_injection", "jailbreak", "data_exfiltration", "tool_abuse"];

/**
 * Create a Live Fire run and return the PLAN. Fires nothing — the console steps
 * through it with a human gate on every step (see /api/red-team/run/[id]/step).
 * Authorization-gated: the caller attests own-AI authority up front.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole("org_admin", "assessor");
    const orgId = session.internalOrgId;
    const sb = supabaseAdmin();
    const body = await req.json().catch(() => ({} as Record<string, unknown>));

    if (body.authorized !== true) {
      throw new ApiError(400, "Authorization required: confirm you own or are authorized to test this AI.");
    }
    const method = (METHODS.includes(body.target_method as TargetMethod) ? body.target_method : "endpoint") as TargetMethod;
    const useCaseId = typeof body.use_case_id === "string" && body.use_case_id ? body.use_case_id : null;
    const note = typeof body.authorization_note === "string" ? body.authorization_note.slice(0, 500) : null;
    const batteries = Array.isArray(body.batteries)
      ? (body.batteries.filter((k: unknown) => BATTERY_KEYS.includes(k as BatteryKey)) as BatteryKey[])
      : undefined;

    let signals = signalsFromUseCase({});
    let label: string | null = null;
    if (useCaseId) {
      const { data: uc } = await sb.from("use_cases").select("id, name, description").eq("org_id", orgId).eq("id", useCaseId).maybeSingle();
      if (!uc) throw new ApiError(404, "Use case not found");
      signals = signalsFromUseCase(uc);
      label = uc.name as string;
    }

    const { runId, plan } = await createRun({
      orgId, useCaseId, authorizedBy: session.userId, authorizationNote: note,
      targetMethod: method, targetLabel: label, signals, batteries,
    });

    await logAudit({ orgId, actor: session.userId, action: "red_team.live_fire_authorized", objectType: "red_team_run", objectId: runId, detail: { method, useCaseId, target: label, steps: plan.steps.length, authorizationNote: note } });

    return NextResponse.json({ ok: true, runId, selectionReason: plan.selectionReason, steps: plan.steps });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("live fire create failed", err);
    return NextResponse.json({ error: "Could not start — please try again." }, { status: 500 });
  }
}
