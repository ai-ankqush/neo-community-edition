import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/server/identity/auth-context";
import { isSuperAdmin, logAdminAccess } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";

/** POST /api/admin/founding-leads — super-admin triages a website Founding lead.
 *  These leads have no org, so there's nothing to comp here — this only tracks
 *  outreach state (new → contacted → closed). Provisioning happens once the person
 *  signs up and the admin comps their org. */
const Body = z.object({ id: z.string().uuid(), action: z.enum(["contacted", "close", "reopen"]) });

const NEXT: Record<string, string> = { contacted: "contacted", close: "closed", reopen: "new" };

export async function POST(req: NextRequest) {
  const { userId } = await getAuthContext();
  if (!isSuperAdmin(userId)) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const { id, action } = Body.parse(await req.json());
    const status = NEXT[action];
    const sb = supabaseAdmin();
    const { error } = await sb
      .from("founding_leads")
      .update({ status, handled_at: new Date().toISOString(), handled_by: userId })
      .eq("id", id);
    if (error) {
      console.error("ADMIN FOUNDING LEAD ERROR", error);
      return NextResponse.json({ error: "Could not update lead" }, { status: 500 });
    }
    await logAdminAccess(userId!, "admin.founding_lead." + action, { id });
    return NextResponse.json({ ok: true, status });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error("ADMIN FOUNDING LEAD ERROR", err);
    return NextResponse.json({ error: "Could not update lead" }, { status: 500 });
  }
}
