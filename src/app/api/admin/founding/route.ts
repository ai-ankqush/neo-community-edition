import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/server/identity/auth-context";
import { isSuperAdmin, logAdminAccess } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";
import { grantFoundingComp } from "@/lib/founding";

/** POST /api/admin/founding - super-admin approves or declines a Founding
 *  Reviewer application. Approve comps the org via grantFoundingComp (reviewer
 *  plan, 30 days, capped at FOUNDING_MAX). */
const Body = z.object({ id: z.string().uuid(), action: z.enum(["approve", "decline"]) });

export async function POST(req: NextRequest) {
  const { userId } = await getAuthContext();
  if (!isSuperAdmin(userId)) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const { id, action } = Body.parse(await req.json());
    const sb = supabaseAdmin();

    const { data: app } = await sb
      .from("founding_applications")
      .select("id, org_id, status")
      .eq("id", id)
      .single();
    if (!app) return NextResponse.json({ error: "Application not found" }, { status: 404 });

    const decided = new Date().toISOString();

    if (action === "decline") {
      await sb.from("founding_applications").update({ status: "declined", decided_at: decided, decided_by: userId }).eq("id", id);
      await sb.from("organizations").update({ plan_requested: null }).eq("id", app.org_id);
      await logAdminAccess(userId!, "admin.founding.decline", { id });
      return NextResponse.json({ ok: true, result: "declined" });
    }

    // approve → comp the org (cap-checked inside grantFoundingComp)
    const result = await grantFoundingComp(app.org_id, userId!);
    if (result === "full") {
      // cap reached — leave the application pending so it isn't lost
      return NextResponse.json({ ok: false, result: "full", error: "All founding seats are taken." }, { status: 409 });
    }
    await sb.from("founding_applications").update({ status: "approved", decided_at: decided, decided_by: userId }).eq("id", id);
    await sb.from("organizations").update({ plan_requested: null }).eq("id", app.org_id);
    await logAdminAccess(userId!, "admin.founding.approve", { id, result });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error("ADMIN FOUNDING ERROR", err);
    return NextResponse.json({ error: "Could not update application" }, { status: 500 });
  }
}
