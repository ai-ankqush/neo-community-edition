import { NextRequest, NextResponse } from "next/server";
import { requireRole, ApiError } from "@/lib/rbac";
import { supabaseAdmin } from "@/lib/supabase";
import { requireFabricEnabled } from "@/server/fabric/gate";

export const dynamic = "force-dynamic";

/** DELETE /api/connections/:id — revoke a connection (admin only). */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole("org_admin");
    await requireFabricEnabled(session.internalOrgId);
    const { id } = await params;
    const sb = supabaseAdmin();
    const { error } = await sb
      .from("org_connections")
      .delete()
      .eq("id", id)
      .eq("org_id", session.internalOrgId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("CONNECTION DELETE ERROR", err);
    return NextResponse.json({ error: "Could not remove connection" }, { status: 500 });
  }
}
