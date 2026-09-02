import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/server/identity/auth-context";
import { supabaseAdmin } from "@/lib/supabase";
import { canAccessAdmin, logAdminAccess } from "@/lib/admin";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const Body = z.object({
  orgId: z.string().uuid(),
  status: z.enum(["requested", "configuring", "active", "disabled"]).optional(),
  acsUrl: z.string().max(500).optional(),
  spEntityId: z.string().max(300).optional(),
  setupInstructions: z.string().max(4000).optional(),
});

/** POST /api/admin/sso — super-admin updates an org's SSO status and/or the
 *  service-provider details handed back to the customer (ACS URL, Entity ID,
 *  notes). Only updates the fields provided.
 *  NOTE: this never creates the Clerk enterprise connection — that's still done
 *  in the Clerk Dashboard. This only records status + the values to display. */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await getAuthContext();
    if (!canAccessAdmin(userId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const body = Body.parse(await req.json());

    await logAdminAccess(userId!, "admin.sso.update");

    const update: Record<string, unknown> = {};
    if (body.status !== undefined) {
      update.status = body.status;
      update.activated_at = body.status === "active" ? new Date().toISOString() : null;
    }
    if (body.acsUrl !== undefined) update.acs_url = body.acsUrl;
    if (body.spEntityId !== undefined) update.sp_entity_id = body.spEntityId;
    if (body.setupInstructions !== undefined) update.setup_instructions = body.setupInstructions;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const sb = supabaseAdmin();
    const { error } = await sb.from("sso_configs").update(update).eq("org_id", body.orgId);
    if (error) throw error;

    await logAudit({
      orgId: body.orgId,
      actor: "super_admin",
      action: "sso.updated",
      detail: { fields: Object.keys(update) },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error("ADMIN SSO ERROR", err);
    return NextResponse.json({ error: "Could not update SSO" }, { status: 500 });
  }
}
