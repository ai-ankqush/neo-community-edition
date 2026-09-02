import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendTrialEndingEmail, sendInactivityNudgeEmail, sendActivateAccountEmail } from "@/server/app-emails";
import { logAudit } from "@/lib/audit";

/**
 * Friendly engagement reminders (separate from the 90-day dormancy/deletion policy):
 *   • Activate account — once, to an org that signed up but never reached the app
 *     (last_active_at is null), created 1–30 days ago.
 *   • Trial ending — once, ~3 days before trial_ends_at.
 *   • Inactivity nudge — once when a workspace goes 10+ days without a sign-in;
 *     re-arms automatically when the user returns (nudge_sent_at < last_active_at).
 * Paying and demo orgs are exempt. Runs daily via Vercel Cron, CRON_SECRET-protected.
 */
export const dynamic = "force-dynamic";

const TRIAL_LEAD_DAYS = 3;
const INACTIVE_DAYS = 10;
const ACTIVATE_AFTER_DAYS = 1;   // give a new signup a beat before nudging
const ACTIVATE_WINDOW_DAYS = 30; // don't resurrect ancient dead signups

type Org = {
  id: string; clerk_org_id: string; name: string;
  plan: string | null; billing_status: string | null; stripe_subscription_id: string | null;
  is_demo: boolean; trial_ends_at: string | null; last_active_at: string | null; created_at: string | null;
  trial_reminder_sent_at: string | null; nudge_sent_at: string | null; activation_email_sent_at: string | null;
};

const exempt = (o: Org) => o.is_demo || o.billing_status === "active" || Boolean(o.stripe_subscription_id);

async function adminContact(clerkOrgId: string): Promise<{ email: string; firstName: string | null } | null> {
  try {
    const client = await clerkClient();
    const res = await client.organizations.getOrganizationMembershipList({ organizationId: clerkOrgId, limit: 100 });
    const admin = res.data.find((m) => m.role === "org:admin") ?? res.data[0];
    const email = admin?.publicUserData?.identifier;
    if (!email) return null;
    return { email, firstName: admin?.publicUserData?.firstName ?? null };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sb = supabaseAdmin();
  const now = Date.now();
  const cols = "id, clerk_org_id, name, plan, billing_status, stripe_subscription_id, is_demo, trial_ends_at, last_active_at, created_at, trial_reminder_sent_at, nudge_sent_at, activation_email_sent_at";
  let activations = 0;
  let trialReminders = 0;
  let nudges = 0;

  // ---- ACTIVATE: signed up but never reached the app (last_active_at is null) ----
  const activateOlderThan = new Date(now - ACTIVATE_AFTER_DAYS * 86400_000).toISOString();
  const activateYoungerThan = new Date(now - ACTIVATE_WINDOW_DAYS * 86400_000).toISOString();
  const { data: neverActive } = await sb.from("organizations").select(cols)
    .is("last_active_at", null)
    .is("activation_email_sent_at", null)
    .lte("created_at", activateOlderThan)
    .gte("created_at", activateYoungerThan)
    .eq("is_demo", false)
    .is("deleted_at", null)
    .limit(200);

  for (const o of (neverActive ?? []) as Org[]) {
    if (exempt(o)) continue;
    const to = await adminContact(o.clerk_org_id);
    if (!to) continue;
    await sb.from("organizations").update({ activation_email_sent_at: new Date().toISOString() }).eq("id", o.id);
    await sendActivateAccountEmail(to.email, to.firstName);
    await logAudit({ orgId: o.id, actor: "system", action: "email.activation_sent", objectType: "organization", objectId: o.id });
    activations++;
  }

  // ---- TRIAL ENDING: ends within the lead window, not yet reminded ----
  const trialCutoff = new Date(now + TRIAL_LEAD_DAYS * 86400_000).toISOString();
  const { data: trialSoon } = await sb.from("organizations").select(cols)
    .not("trial_ends_at", "is", null)
    .gte("trial_ends_at", new Date(now).toISOString())
    .lte("trial_ends_at", trialCutoff)
    .is("trial_reminder_sent_at", null)
    .eq("is_demo", false)
    .is("deleted_at", null)
    .limit(200);

  for (const o of (trialSoon ?? []) as Org[]) {
    if (exempt(o)) continue;
    const to = await adminContact(o.clerk_org_id);
    if (!to) continue;
    const days = Math.max(0, Math.ceil((new Date(o.trial_ends_at as string).getTime() - now) / 86400_000));
    await sb.from("organizations").update({ trial_reminder_sent_at: new Date().toISOString() }).eq("id", o.id);
    await sendTrialEndingEmail(to.email, to.firstName, o.name, days);
    await logAudit({ orgId: o.id, actor: "system", action: "email.trial_reminder_sent", objectType: "organization", objectId: o.id });
    trialReminders++;
  }

  // ---- INACTIVITY NUDGE: idle 10+ days, not nudged since they were last active ----
  const idleCutoff = new Date(now - INACTIVE_DAYS * 86400_000).toISOString();
  const { data: idle } = await sb.from("organizations").select(cols)
    .lt("last_active_at", idleCutoff)
    .eq("is_demo", false)
    .is("deleted_at", null)
    .limit(200);

  for (const o of (idle ?? []) as Org[]) {
    if (exempt(o)) continue;
    // re-arm gate: skip if we've already nudged since their last sign-in
    if (o.nudge_sent_at && o.last_active_at && o.nudge_sent_at >= o.last_active_at) continue;
    // don't pile a nudge on top of a trial reminder sent in the same pass
    if (o.trial_reminder_sent_at && (now - new Date(o.trial_reminder_sent_at).getTime()) < 2 * 86400_000) continue;
    const to = await adminContact(o.clerk_org_id);
    if (!to) continue;
    await sb.from("organizations").update({ nudge_sent_at: new Date().toISOString() }).eq("id", o.id);
    await sendInactivityNudgeEmail(to.email, to.firstName, o.name);
    await logAudit({ orgId: o.id, actor: "system", action: "email.inactivity_nudge_sent", objectType: "organization", objectId: o.id });
    nudges++;
  }

  return NextResponse.json({ activations, trialReminders, nudges });
}
