import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendDormancyWarningEmail } from "@/server/app-emails";
import { logAudit } from "@/lib/audit";
import { logAdminAccess } from "@/lib/admin";
import { purgeOrgHard } from "@/lib/org-delete";

/**
 * Dormancy policy: orgs inactive 90+ days get a warning email; if not confirmed
 * within the grace window, they are hard-deleted. Paying (active subscription)
 * and demo orgs are always exempt. Runs daily via Vercel Cron (see vercel.json),
 * protected by CRON_SECRET.
 */
export const dynamic = "force-dynamic";

const DORMANT_DAYS = 90;
const GRACE_DAYS = 14;
const APP = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.neocontrol.ai";

type Org = { id: string; clerk_org_id: string; name: string; billing_status: string | null; stripe_subscription_id: string | null; is_demo: boolean };

function exempt(o: Org): boolean {
  return o.is_demo || o.billing_status === "active" || Boolean(o.stripe_subscription_id);
}

async function adminEmail(clerkOrgId: string): Promise<string | null> {
  try {
    const client = await clerkClient();
    const res = await client.organizations.getOrganizationMembershipList({ organizationId: clerkOrgId, limit: 100 });
    const admin = res.data.find((m) => m.role === "org:admin") ?? res.data[0];
    return admin?.publicUserData?.identifier ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (req.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const sb = supabaseAdmin();
  const now = Date.now();
  const cutoff90 = new Date(now - DORMANT_DAYS * 86400_000).toISOString();
  const cutoffGrace = new Date(now - GRACE_DAYS * 86400_000).toISOString();
  let warned = 0;
  let deleted = 0;

  // ---- WARN: inactive 90+ days, not yet warned ----
  const { data: toWarn } = await sb
    .from("organizations")
    .select("id, clerk_org_id, name, billing_status, stripe_subscription_id, is_demo")
    .lt("last_active_at", cutoff90)
    .is("dormancy_warned_at", null)
    .eq("is_demo", false)
    .is("deleted_at", null)
    .limit(100);

  for (const o of (toWarn ?? []) as Org[]) {
    if (exempt(o)) continue;
    const email = await adminEmail(o.clerk_org_id);
    if (!email) continue; // never delete an org we can't warn

    const token = crypto.randomUUID();
    await sb.from("organizations").update({ dormancy_warned_at: new Date().toISOString(), confirm_token: token }).eq("id", o.id);

    const link = `${APP}/api/account/confirm?token=${token}`;
    await sendDormancyWarningEmail(email, null, o.name, link, DORMANT_DAYS, GRACE_DAYS);
    await logAudit({ orgId: o.id, actor: "system", action: "account.dormancy_warned", objectType: "organization", objectId: o.id });
    warned++;
  }

  // ---- DELETE: warned > grace days ago, still inactive ----
  const { data: toDelete } = await sb
    .from("organizations")
    .select("id, clerk_org_id, name, billing_status, stripe_subscription_id, is_demo")
    .lt("dormancy_warned_at", cutoffGrace)
    .lt("last_active_at", cutoff90)
    .eq("is_demo", false)
    .is("deleted_at", null)
    .limit(100);

  for (const o of (toDelete ?? []) as Org[]) {
    if (exempt(o)) continue; // safety: never delete a paying/demo org
    // best-effort: delete the Clerk organization too
    try {
      const client = await clerkClient();
      await client.organizations.deleteOrganization(o.clerk_org_id);
    } catch {
      /* org may already be gone in Clerk */
    }
    await logAudit({ orgId: o.id, actor: "system", action: "account.deleted_dormant", objectType: "organization", objectId: o.id, detail: { name: o.name } });
    // hard delete our row — child tables cascade via FK on delete cascade
    await sb.from("organizations").delete().eq("id", o.id);
    deleted++;
  }

  // ---- REVERT: expired comps (Founding Reviewer + white-label 2-week plan trials) ----
  // Any non-Stripe org whose comp_until has passed drops back to the plan picker. This covers both
  // the Founding Reviewer comp and the on-request "try any plan for 2 weeks" self-serve switch.
  let reverted = 0;
  const { data: toRevert } = await sb
    .from("organizations")
    .select("id")
    .lt("comp_until", new Date().toISOString())
    .is("stripe_subscription_id", null)
    .eq("is_demo", false)
    .is("deleted_at", null)
    .limit(100);
  for (const o of (toRevert ?? []) as { id: string }[]) {
    // drop to an expired trial so they hit the plan picker (a clean conversion moment)
    await sb.from("organizations").update({ plan: "trial", trial_ends_at: new Date().toISOString() }).eq("id", o.id);
    await logAudit({ orgId: o.id, actor: "system", action: "billing.reviewer_expired", objectType: "organization", objectId: o.id });
    reverted++;
  }

  // ---- PURGE: admin soft-deleted orgs whose 30-day hold has passed ----
  let purged = 0;
  const { data: toPurge } = await sb
    .from("organizations")
    .select("id, clerk_org_id, name")
    .not("deleted_at", "is", null)
    .lt("purge_after", new Date().toISOString())
    .limit(100);
  for (const o of (toPurge ?? []) as { id: string; clerk_org_id: string; name: string }[]) {
    // durable record (admin_access_log is not cascaded by the org delete)
    await logAdminAccess("system", "admin.org.purged", { orgId: o.id, name: o.name });
    await purgeOrgHard(o.id, o.clerk_org_id);
    purged++;
  }

  return NextResponse.json({ warned, deleted, reverted, purged });
}
