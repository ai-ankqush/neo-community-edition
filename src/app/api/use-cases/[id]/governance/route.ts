import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, ApiError } from "@/lib/rbac";
import { supabaseAdmin } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** POST /api/use-cases/[id]/governance — edit governance fields and log/close
 *  exceptions + incidents (the AI Control Graph spine). org_admin / assessor. */
const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("fields"),
    technicalOwner: z.string().max(200).nullable().optional(),
    sponsor: z.string().max(200).nullable().optional(),
    lifecycle: z.enum(["proposed", "pilot", "production", "retired"]).nullable().optional(),
  }),
  z.object({
    action: z.literal("add_exception"),
    title: z.string().min(1).max(200), detail: z.string().max(2000).optional(),
    riskOwner: z.string().max(200).optional(), expiresOn: z.string().max(40).optional(),
  }),
  z.object({
    action: z.literal("add_incident"),
    title: z.string().min(1).max(200), severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
    note: z.string().max(2000).optional(), occurredAt: z.string().max(40).optional(),
  }),
  z.object({ action: z.literal("resolve_incident"), id: z.string().uuid() }),
  z.object({ action: z.literal("close_exception"), id: z.string().uuid() }),
]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: useCaseId } = await params;
    const session = await requireRole("org_admin", "assessor");
    const sb = supabaseAdmin();

    const { data: uc } = await sb.from("use_cases").select("id").eq("id", useCaseId).eq("org_id", session.internalOrgId).maybeSingle();
    if (!uc) throw new ApiError(404, "Use case not found");

    const b = Body.parse(await req.json());
    const org = session.internalOrgId;

    if (b.action === "fields") {
      const patch: Record<string, unknown> = {};
      if ("technicalOwner" in b) patch.technical_owner = b.technicalOwner || null;
      if ("sponsor" in b) patch.sponsor = b.sponsor || null;
      if ("lifecycle" in b) patch.lifecycle = b.lifecycle || null;
      await sb.from("use_cases").update(patch).eq("id", useCaseId).eq("org_id", org);
    } else if (b.action === "add_exception") {
      await sb.from("use_case_exceptions").insert({
        org_id: org, use_case_id: useCaseId, title: b.title, detail: b.detail ?? null,
        risk_owner: b.riskOwner ?? null, expires_on: b.expiresOn || null, created_by: session.userId,
      });
    } else if (b.action === "add_incident") {
      await sb.from("use_case_incidents").insert({
        org_id: org, use_case_id: useCaseId, title: b.title, severity: b.severity,
        note: b.note ?? null, occurred_at: b.occurredAt || null, created_by: session.userId,
      });
    } else if (b.action === "resolve_incident") {
      await sb.from("use_case_incidents").update({ status: "resolved" }).eq("id", b.id).eq("org_id", org).eq("use_case_id", useCaseId);
    } else if (b.action === "close_exception") {
      await sb.from("use_case_exceptions").update({ status: "closed" }).eq("id", b.id).eq("org_id", org).eq("use_case_id", useCaseId);
    }

    // Audit every governance resolution — who accepted/closed what, on which use case.
    await logAudit({ orgId: org, actor: session.userId, action: `governance.${b.action}`, objectType: "use_case", objectId: useCaseId, detail: b });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error("GOVERNANCE ERROR", err);
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }
}
