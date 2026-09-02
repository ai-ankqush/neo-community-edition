import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { requireSession, ApiError } from "@/lib/rbac";
import { isSuperAdmin, logAdminAccess } from "@/lib/admin";
import {
  sendWelcomeEmail, sendActivateAccountEmail, sendTrialEndingEmail,
  sendInactivityNudgeEmail, sendDormancyWarningEmail, sendVendorReviewInviteEmail,
} from "@/server/app-emails";

/**
 * GET /api/admin/test-emails?to=you@example.com — super-admin only. Sends one of
 * every transactional email (sample data) so you can eyeball real rendering in your
 * inbox before shipping. If ?to is omitted, sends to your own account email.
 * Returns which sent (false = SMTP not configured in this environment).
 */
export const dynamic = "force-dynamic";
const APP = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.neocontrol.ai";

export async function GET(req: NextRequest) {
  try {
    const s = await requireSession();
    if (!isSuperAdmin(s.userId)) throw new ApiError(403, "Forbidden");

    const user = await (await clerkClient()).users.getUser(s.userId);
    const firstName = user.firstName ?? null;
    const to = (req.nextUrl.searchParams.get("to")
      ?? user.primaryEmailAddress?.emailAddress
      ?? user.emailAddresses?.[0]?.emailAddress ?? "").trim();
    if (!to) throw new ApiError(400, "No recipient — pass ?to=you@example.com");

    const ws = "Your workspace";
    const sent = {
      welcome: await sendWelcomeEmail(to, firstName),
      activate: await sendActivateAccountEmail(to, firstName),
      trial_ending: await sendTrialEndingEmail(to, firstName, ws, 3),
      inactivity_nudge: await sendInactivityNudgeEmail(to, firstName, ws),
      dormancy_warning: await sendDormancyWarningEmail(to, firstName, ws, `${APP}/dashboard`, 90, 14),
      vendor_invite: await sendVendorReviewInviteEmail(to, "Acme Corp", "VendorGPT", `${APP}/vendor-portal/sample-token`),
    };

    await logAdminAccess(s.userId, "admin.test_emails_sent", { to, sent });
    const anyFailed = Object.values(sent).some((ok) => !ok);
    return NextResponse.json({
      to,
      sent,
      note: anyFailed ? "Some returned false — SMTP_HOST/USER/PASS likely not set in this environment." : "All sent.",
    });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("TEST EMAILS ERROR", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
