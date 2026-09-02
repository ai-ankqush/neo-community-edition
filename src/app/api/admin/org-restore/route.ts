import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/server/identity/auth-context";
import { canAccessAdmin, logAdminAccess } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";
import { restoreOrg } from "@/lib/org-delete";

const Body = z.object({ orgId: z.string().uuid() });

/** POST /api/admin/org-restore - super-admin lifts an org out of the deletion
 *  hold, restoring access. Only valid before the cron purges it. */
export async function POST(req: NextRequest) {
  const { userId } = await getAuthContext();
  if (!canAccessAdmin(userId)) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const { orgId } = Body.parse(await req.json());
    const { data: org } = await supabaseAdmin()
      .from("organizations")
      .select("id, name, deleted_at")
      .eq("id", orgId)
      .maybeSingle();
    if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });
    if (!org.deleted_at) return NextResponse.json({ error: "Org is not in the hold." }, { status: 400 });

    await restoreOrg(org.id);
    await logAdminAccess(userId!, "admin.org.restore", { orgId: org.id, name: org.name });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error("ORG RESTORE ERROR", err);
    return NextResponse.json({ error: "Could not restore org" }, { status: 500 });
  }
}
