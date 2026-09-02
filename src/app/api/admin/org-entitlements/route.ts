import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/server/identity/auth-context";
import { canAccessAdmin, logAdminAccess } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";

const Overrides = z
  .object({
    useCasesActive: z.number().int().min(0).max(100000).optional(),
    vendorReviewsActive: z.number().int().min(0).max(100000).optional(),
    redTeam: z.boolean().optional(),
    vendorReview: z.boolean().optional(),
    integrations: z.boolean().optional(),
    supplyChain: z.boolean().optional(),
    codeGeneration: z.boolean().optional(),
    verificationLive: z.boolean().optional(),
    advancedReporting: z.boolean().optional(),
    sso: z.boolean().optional(),
    multiWorkspace: z.boolean().optional(),
  })
  .strict();

const Body = z.object({
  orgId: z.string().uuid(),
  overrides: Overrides,
  suspended: z.boolean(),
});

/** POST /api/admin/org-entitlements — super-admin sets a customer's entitlement overrides + suspend.
 *  Only keys present in `overrides` change; everything else inherits the plan default. */
export async function POST(req: NextRequest) {
  const { userId } = await getAuthContext();
  if (!canAccessAdmin(userId)) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const { orgId, overrides, suspended } = Body.parse(await req.json());
    // strip undefined/null so we store only explicit overrides
    const clean = Object.fromEntries(
      Object.entries(overrides).filter(([, v]) => v !== undefined && v !== null)
    );
    await supabaseAdmin()
      .from("organizations")
      .update({ entitlement_overrides: clean, suspended })
      .eq("id", orgId);
    await logAdminAccess(userId!, "admin.org.entitlements", { orgId, overrides: clean, suspended });
    await logAudit({
      orgId,
      actor: userId!,
      action: "billing.entitlements_changed_admin",
      objectType: "organization",
      objectId: orgId,
      detail: { overrides: clean, suspended },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error("ORG ENTITLEMENTS ERROR", err);
    return NextResponse.json({ error: "Could not update entitlements" }, { status: 500 });
  }
}
