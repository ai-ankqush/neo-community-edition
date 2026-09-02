import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/server/identity/auth-context";
import { canAccessAdmin, logAdminAccess } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";

const Body = z.object({
  orgId: z.string().uuid(),
  action: z.enum(["community", "trial", "practitioner", "starter", "reviewer_30", "enterprise_30", "enterprise_perm"]),
});

/** POST /api/admin/org-plan - super-admin sets an org's plan.
 *  reviewer_30 = Founding Reviewer comp (Enterprise features, 10-use-case cap) for 30 days,
 *  enterprise_30 = full Enterprise with a 30-day comp, enterprise_perm = full Enterprise no expiry,
 *  trial/starter = that plan, comp cleared. The 30-day comps auto-revert via the dormancy cron. */
export async function POST(req: NextRequest) {
  const { userId } = await getAuthContext();
  if (!canAccessAdmin(userId)) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const { orgId, action } = Body.parse(await req.json());
    const in30Days = new Date(Date.now() + 30 * 86400_000).toISOString();

    let update: { plan: string; comp_until: string | null };
    if (action === "reviewer_30") {
      update = { plan: "reviewer", comp_until: in30Days };
    } else if (action === "enterprise_30") {
      update = { plan: "enterprise", comp_until: in30Days };
    } else if (action === "enterprise_perm") {
      update = { plan: "enterprise", comp_until: null };
    } else {
      update = { plan: action, comp_until: null };
    }

    // Setting a plan also resolves any pending upgrade request for this org.
    await supabaseAdmin().from("organizations").update({ ...update, plan_requested: null }).eq("id", orgId);
    await logAdminAccess(userId!, "admin.org.plan_change", { orgId, action });
    await logAudit({
      orgId,
      actor: userId!,
      action: "billing.plan_changed_admin",
      objectType: "organization",
      objectId: orgId,
      detail: { action, plan: update.plan },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error("ORG PLAN ERROR", err);
    return NextResponse.json({ error: "Could not update plan" }, { status: 500 });
  }
}
