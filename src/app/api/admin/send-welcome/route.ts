import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { requireSession, ApiError } from "@/lib/rbac";
import { isSuperAdmin, logAdminAccess } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";
import { sendWelcomeEmail } from "@/server/app-emails";

/**
 * POST /api/admin/send-welcome { orgId } — super-admin only. Sends the real welcome
 * email to an org's admin (for orgs that signed up before the welcome hook, or never
 * finished onboarding). Resolves the admin address from Clerk. Access is logged.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const s = await requireSession();
    if (!isSuperAdmin(s.userId)) throw new ApiError(403, "Forbidden");
    const { orgId } = await req.json().catch(() => ({}));
    if (!orgId) throw new ApiError(400, "Missing orgId");

    const { data: org } = await supabaseAdmin()
      .from("organizations").select("clerk_org_id, name").eq("id", orgId).single();
    if (!org?.clerk_org_id) throw new ApiError(404, "Org not found");

    const client = await clerkClient();
    const res = await client.organizations.getOrganizationMembershipList({ organizationId: org.clerk_org_id, limit: 100 });
    const admin = res.data.find((m) => m.role === "org:admin") ?? res.data[0];
    const to = admin?.publicUserData?.identifier;
    if (!to) throw new ApiError(422, "No admin email on file for this org");

    const ok = await sendWelcomeEmail(to, admin?.publicUserData?.firstName ?? null);
    await logAdminAccess(s.userId, "admin.welcome_sent", { orgId, to, ok });
    if (!ok) throw new ApiError(500, "SMTP not configured — email not sent");
    return NextResponse.json({ ok: true, to });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("SEND WELCOME ERROR", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
