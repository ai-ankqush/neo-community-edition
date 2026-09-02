import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, ApiError } from "@/lib/rbac";
import { supabaseAdmin } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { suggestMappings } from "@/server/frameworks/custom";

export const maxDuration = 120;

const Action = z.object({
  action: z.enum(["suggest", "map", "delete_mapping", "update"]),
  pastedCatalog: z.string().max(20000).optional(),
  // for map / delete_mapping:
  scope: z.enum(["pillar", "control"]).optional(),
  pillar: z.number().int().min(1).max(10).optional(),
  controlId: z.string().uuid().optional(),
  reference: z.string().max(600).optional(),
  status: z.enum(["suggested", "confirmed"]).optional(),
  // for update:
  name: z.string().min(2).max(120).optional(),
  authority: z.string().max(120).optional(),
  description: z.string().max(1000).optional(),
});

/** Framework operations: Neo-suggest the crosswalk, upsert/confirm a mapping, delete an override. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireRole("org_admin", "assessor");
    const sb = supabaseAdmin();
    const b = Action.parse(await req.json());

    const { data: fw } = await sb.from("org_frameworks").select("id").eq("org_id", session.internalOrgId).eq("id", id).maybeSingle();
    if (!fw) throw new ApiError(404, "Framework not found");

    if (b.action === "suggest") {
      const r = await suggestMappings(session.internalOrgId, id, b.pastedCatalog);
      await logAudit({ orgId: session.internalOrgId, actor: session.userId, action: "framework.suggest", objectType: "framework", objectId: id, detail: { proposed: r.saved, source: r.source, uncovered: r.uncoveredPillars.length } });
      return NextResponse.json({
        ok: true, proposed: r.saved, source: r.source,
        covered: r.coveredPillars, uncovered: r.uncoveredPillars, note: r.note,
      });
    }

    if (b.action === "update") {
      const patch: Record<string, string | null> = {};
      if (b.name !== undefined) patch.name = b.name.trim();
      if (b.authority !== undefined) patch.authority = b.authority.trim() || null;
      if (b.description !== undefined) patch.description = b.description.trim() || null;
      if (Object.keys(patch).length === 0) throw new ApiError(400, "Nothing to update.");
      const { error } = await sb.from("org_frameworks").update(patch).eq("org_id", session.internalOrgId).eq("id", id);
      if (error) throw new ApiError(500, error.message);
      await logAudit({ orgId: session.internalOrgId, actor: session.userId, action: "framework.update", objectType: "framework", objectId: id, detail: patch });
      return NextResponse.json({ ok: true });
    }

    if (b.action === "map") {
      // upsert a mapping the human is confirming/editing → source human, status confirmed (unless flagged)
      if (!b.scope || !b.reference?.trim()) throw new ApiError(400, "scope and reference required.");
      const status = b.status ?? "confirmed";
      const match = b.scope === "pillar"
        ? sb.from("org_framework_mappings").select("id").eq("org_id", session.internalOrgId).eq("framework_id", id).eq("scope", "pillar").eq("pillar", b.pillar!)
        : sb.from("org_framework_mappings").select("id").eq("org_id", session.internalOrgId).eq("framework_id", id).eq("scope", "control").eq("control_id", b.controlId!);
      const { data: existing } = await match.maybeSingle();
      const row = {
        org_id: session.internalOrgId, framework_id: id, scope: b.scope,
        pillar: b.scope === "pillar" ? b.pillar : null, control_id: b.scope === "control" ? b.controlId : null,
        reference: b.reference.trim(), status, source: "human", updated_at: new Date().toISOString(),
      };
      if (existing?.id) await sb.from("org_framework_mappings").update(row).eq("id", existing.id);
      else await sb.from("org_framework_mappings").insert(row);
      return NextResponse.json({ ok: true });
    }

    if (b.action === "delete_mapping") {
      let q = sb.from("org_framework_mappings").delete().eq("org_id", session.internalOrgId).eq("framework_id", id).eq("scope", b.scope ?? "pillar");
      q = b.scope === "control" ? q.eq("control_id", b.controlId!) : q.eq("pillar", b.pillar!);
      await q;
      return NextResponse.json({ ok: true });
    }

    throw new ApiError(400, "Unknown action");
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error("FRAMEWORK OP", err);
    return NextResponse.json({ error: "Operation failed" }, { status: 500 });
  }
}

/** Delete a framework and all its mappings. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireRole("org_admin");
    const sb = supabaseAdmin();
    const { error } = await sb.from("org_frameworks").delete().eq("org_id", session.internalOrgId).eq("id", id);
    if (error) throw new ApiError(500, error.message);
    await logAudit({ orgId: session.internalOrgId, actor: session.userId, action: "framework.delete", objectType: "framework", objectId: id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Could not delete" }, { status: 500 });
  }
}
