import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, ApiError } from "@/lib/rbac";
import { supabaseAdmin } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { planFor } from "@/lib/plans";

/**
 * PATCH /api/controls/:id - update a control's status.
 *   implementationStatus -> manual progress tracking (in_place | partial | gap).
 *     Available on ALL plans (until live connectors exist, teams track by hand).
 *   verificationStatus   -> evidence-backed verification (Premium+). Syncs the
 *     implementation status so dashboards agree. Live connector checks
 *     (Enterprise) write through the same model with mode='live'.
 */

const Body = z
  .object({
    implementationStatus: z.enum(["in_place", "partial", "gap"]).optional(),
    verificationStatus: z.enum(["verified", "partial", "missing", "not_checked"]).optional(),
    note: z.string().max(2000).optional(),
    evidenceUrl: z.string().max(2000).optional(),
  })
  .refine((b) => b.implementationStatus || b.verificationStatus || b.evidenceUrl !== undefined, {
    message: "Provide implementationStatus, verificationStatus, or evidenceUrl",
  });

const STATUS_SYNC: Record<string, string | null> = {
  verified: "in_place",
  partial: "partial",
  missing: "gap",
  not_checked: null,
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireRole("org_admin", "assessor");
    const body = Body.parse(await req.json());
    const sb = supabaseAdmin();

    // --- manual implementation tracking (all plans) ---
    if (body.implementationStatus) {
      const { data, error } = await sb
        .from("control_items")
        .update({ status: body.implementationStatus })
        .eq("org_id", session.internalOrgId)
        .eq("id", id)
        .select("id")
        .single();
      if (error) throw error;
      if (!data) throw new ApiError(404, "Control not found");

      await logAudit({
        orgId: session.internalOrgId,
        actor: session.userId,
        action: "control.status",
        objectType: "control_item",
        objectId: id,
        detail: { status: body.implementationStatus, mode: "manual" },
      });
      return NextResponse.json({ ok: true });
    }

    // --- manual evidence attachment (a link), independent of status (Premium+) ---
    if (body.evidenceUrl !== undefined && !body.verificationStatus) {
      const { data: orgRow0 } = await sb.from("organizations").select("plan").eq("id", session.internalOrgId).single();
      if (!planFor(orgRow0?.plan).verificationManual) {
        throw new ApiError(402, "Evidence attachment is available on Premium and Enterprise plans.");
      }
      const patch0: Record<string, unknown> = { evidence_url: body.evidenceUrl || null };
      if (body.note !== undefined) patch0.verification_note = body.note || null;
      const { data, error } = await sb.from("control_items").update(patch0)
        .eq("org_id", session.internalOrgId).eq("id", id).select("id").single();
      if (error) throw error;
      if (!data) throw new ApiError(404, "Control not found");
      await logAudit({ orgId: session.internalOrgId, actor: session.userId, action: "control.evidence", objectType: "control_item", objectId: id, detail: { evidence_url: Boolean(body.evidenceUrl) } });
      return NextResponse.json({ ok: true });
    }

    // --- evidence-backed verification (Premium+) ---
    const { data: orgRow } = await sb
      .from("organizations").select("plan").eq("id", session.internalOrgId).single();
    if (!planFor(orgRow?.plan).verificationManual) {
      throw new ApiError(402, "Control verification is available on Premium and Enterprise plans.");
    }

    const vs = body.verificationStatus!;
    const patch: Record<string, unknown> = {
      verification_status: vs,
      verification_mode: "manual",
      verification_note: body.note ?? null,
      verified_by: session.userId,
      verified_at: new Date().toISOString(),
    };
    if (body.evidenceUrl !== undefined) patch.evidence_url = body.evidenceUrl || null;
    const sync = STATUS_SYNC[vs];
    if (sync) patch.status = sync;

    const { data, error } = await sb
      .from("control_items")
      .update(patch)
      .eq("org_id", session.internalOrgId)
      .eq("id", id)
      .select("id")
      .single();
    if (error) throw error;
    if (!data) throw new ApiError(404, "Control not found");

    await logAudit({
      orgId: session.internalOrgId,
      actor: session.userId,
      action: "control.verify",
      objectType: "control_item",
      objectId: id,
      detail: { status: vs, mode: "manual" },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
