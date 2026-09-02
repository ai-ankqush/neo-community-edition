import { NextRequest, NextResponse } from "next/server";
import { requireRole, ApiError } from "@/lib/rbac";
import { supabaseAdmin } from "@/lib/supabase";
import { requireFabricEnabled } from "@/server/fabric/gate";
import { getRecipe, runRecipeCheck } from "@/server/fabric/recipes/registry";
import { recordEvidence } from "@/server/fabric/evidence";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** POST /api/integrations/:provider/check — run one of the recipe's capability
 *  checks against the org's connection (standalone, not tied to a use case).
 *  Body: { capabilityId? }. Records evidence (use_case_id null) for the ledger. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const session = await requireRole("org_admin", "assessor");
    await requireFabricEnabled(session.internalOrgId);
    const { provider } = await params;
    const recipe = getRecipe(provider);
    if (!recipe) throw new ApiError(404, "Unknown provider");

    const body = await req.json().catch(() => ({}));
    const capabilityId = String(body.capabilityId ?? recipe.capabilities[0]?.capabilityId ?? "");
    if (!capabilityId) throw new ApiError(400, "No capability to check.");

    const { data: conn } = await supabaseAdmin()
      .from("org_connections").select("credential")
      .eq("org_id", session.internalOrgId).eq("provider", provider).eq("status", "connected")
      .limit(1).maybeSingle();
    if (!conn) throw new ApiError(400, "Not connected yet.");

    const check = await runRecipeCheck(recipe, capabilityId, (conn.credential ?? {}) as Record<string, unknown>, {});
    await recordEvidence({
      orgId: session.internalOrgId, useCaseId: null, capabilityId, provider, actor: session.userId, check,
    });
    return NextResponse.json({ check });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("INTEGRATION CHECK ERROR", err);
    return NextResponse.json({ error: "Check failed" }, { status: 500 });
  }
}
