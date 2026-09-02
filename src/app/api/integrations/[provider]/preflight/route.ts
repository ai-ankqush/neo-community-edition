import { NextRequest, NextResponse } from "next/server";
import { requireRole, ApiError } from "@/lib/rbac";
import { supabaseAdmin } from "@/lib/supabase";
import { requireFabricEnabled } from "@/server/fabric/gate";
import { getRecipe, runPreflight } from "@/server/fabric/recipes/registry";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** POST /api/integrations/:provider/preflight — run the recipe's preflight tests
 *  against the org's stored connection. Returns per-test readiness. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const session = await requireRole("org_admin", "assessor");
    await requireFabricEnabled(session.internalOrgId);
    const { provider } = await params;
    const recipe = getRecipe(provider);
    if (!recipe) throw new ApiError(404, "Unknown provider");

    const sb = supabaseAdmin();
    const { data: conn } = await sb
      .from("org_connections").select("id, credential")
      .eq("org_id", session.internalOrgId).eq("provider", provider).eq("status", "connected")
      .limit(1).maybeSingle();
    if (!conn) throw new ApiError(400, "Not connected yet.");

    const results = await runPreflight(recipe, (conn.credential ?? {}) as Record<string, unknown>);
    await sb.from("org_connections")
      .update({ last_preflight: results, last_preflight_at: new Date().toISOString() })
      .eq("id", conn.id);
    return NextResponse.json({ results });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("PREFLIGHT ERROR", err);
    return NextResponse.json({ error: "Preflight failed" }, { status: 500 });
  }
}
