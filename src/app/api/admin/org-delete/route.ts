import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/server/identity/auth-context";
import { canAccessAdmin, logAdminAccess } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";
import { softDeleteOrg, PURGE_HOLD_DAYS } from "@/lib/org-delete";

const Body = z.object({ orgId: z.string().uuid(), confirmName: z.string().min(1) });

/** POST /api/admin/org-delete - super-admin soft-deletes an org.
 *  Requires the exact org name as confirmation. The org is locked out of the
 *  app and scheduled for permanent purge after a 30-day hold; it can be
 *  restored from /admin until then. Recorded in admin_access_log. */
export async function POST(req: NextRequest) {
  const { userId } = await getAuthContext();
  if (!canAccessAdmin(userId)) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const { orgId, confirmName } = Body.parse(await req.json());
    const sb = supabaseAdmin();

    const { data: org } = await sb
      .from("organizations")
      .select("id, name, is_demo, deleted_at")
      .eq("id", orgId)
      .maybeSingle();
    if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });
    if (org.is_demo) return NextResponse.json({ error: "Refusing to delete the demo org." }, { status: 400 });
    if (org.deleted_at) return NextResponse.json({ error: "Already in the deletion hold." }, { status: 400 });
    if (confirmName.trim() !== org.name) return NextResponse.json({ error: "Name does not match." }, { status: 400 });

    await softDeleteOrg(org.id, userId!);
    await logAdminAccess(userId!, "admin.org.soft_delete", { orgId: org.id, name: org.name, holdDays: PURGE_HOLD_DAYS });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error("ORG DELETE ERROR", err);
    return NextResponse.json({ error: "Could not delete org" }, { status: 500 });
  }
}
