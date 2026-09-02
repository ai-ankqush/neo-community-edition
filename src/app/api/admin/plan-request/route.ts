import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/server/identity/auth-context";
import { canAccessAdmin, logAdminAccess } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";

/**
 * POST /api/admin/plan-request  { orgId, action, duration? }
 * Decide on a customer's tier trial (they already have instant 2-week access; plan_requested flags it
 * as awaiting a decision).
 *   - approve + duration "30" | "90": extend the tier for that many days from now (comp_until).
 *   - approve + duration "indefinite": make the tier permanent (comp_until null) — a signed customer.
 *   - dismiss: clear the pending flag and let the 2-week trial lapse on its own (dormancy reverts it).
 * Admin (super or partner-admin) only.
 */
const Body = z.object({
  orgId: z.string().uuid(),
  action: z.enum(["approve", "dismiss"]),
  duration: z.enum(["30", "90", "indefinite"]).optional(),
});

export async function POST(req: NextRequest) {
  const { userId } = await getAuthContext();
  if (!canAccessAdmin(userId)) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const { orgId, action, duration } = Body.parse(await req.json());
    const sb = supabaseAdmin();

    if (action === "approve") {
      if (!duration) return NextResponse.json({ error: "duration required to approve" }, { status: 400 });
      const compUntil = duration === "indefinite" ? null : new Date(Date.now() + Number(duration) * 86400_000).toISOString();
      // Keep the tier they're trialing; set the window and clear the pending flag.
      await sb.from("organizations").update({ comp_until: compUntil, plan_requested: null }).eq("id", orgId);
      await logAudit({ orgId, actor: userId!, action: "billing.trial_approved", objectType: "organization", objectId: orgId, detail: { duration } });
    } else {
      // Dismiss: stop tracking it; the 2-week comp lapses on its own.
      await sb.from("organizations").update({ plan_requested: null }).eq("id", orgId);
      await logAudit({ orgId, actor: userId!, action: "billing.trial_dismissed", objectType: "organization", objectId: orgId });
    }

    await logAdminAccess(userId!, "admin.plan_request." + action, { orgId, duration });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error("PLAN REQUEST", err);
    return NextResponse.json({ error: "Could not process request" }, { status: 500 });
  }
}
