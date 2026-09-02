import { NextResponse } from "next/server";
import JSZip from "jszip";
import { requireSession, ApiError } from "@/lib/rbac";
import { supabaseAdmin } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { buildPack, type PackControl } from "@/lib/implementation-pack";

export const dynamic = "force-dynamic";

/** GET /api/use-cases/:id/pack - download the Implementation Pack (zip). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireSession();
    const sb = supabaseAdmin();

    const [{ data: uc }, { data: controls }, { data: approval }] = await Promise.all([
      sb.from("use_cases").select("name, tier, methodology_version, stack").eq("org_id", session.internalOrgId).eq("id", id).maybeSingle(),
      sb.from("control_items")
        .select("pillar, control, why, requirement, status, stack_implementation, evidence, assurance_test, framework_refs, artifact_type, artifact_filename, artifact_content")
        .eq("org_id", session.internalOrgId).eq("use_case_id", id).order("pillar", { ascending: true }),
      sb.from("approvals").select("decision").eq("org_id", session.internalOrgId).eq("use_case_id", id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    if (!uc) throw new ApiError(404, "Use case not found");
    if (!controls || controls.length === 0) {
      throw new ApiError(400, "No controls to package yet — complete the Controls stage first.");
    }

    const files = buildPack(
      { name: uc.name, tier: uc.tier, decision: approval?.decision ?? null, methodologyVersion: uc.methodology_version },
      controls as PackControl[],
      (uc.stack as never) ?? null,
    );

    const zip = new JSZip();
    for (const f of files) zip.file(f.path, f.content);
    const buf = await zip.generateAsync({ type: "nodebuffer" });

    const withCode = (controls as PackControl[]).filter((c) => c.artifact_content).length;
    await logAudit({
      orgId: session.internalOrgId,
      actor: session.userId,
      action: "pack.download",
      objectType: "use_case",
      objectId: id,
      detail: { controls: controls.length, withGeneratedCode: withCode },
    });

    const safe = uc.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "use-case";
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="neo-pack-${safe}.zip"`,
      },
    });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("PACK ERROR", err);
    return NextResponse.json({ error: "Could not build pack" }, { status: 500 });
  }
}
