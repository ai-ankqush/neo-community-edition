import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { requireSession, ApiError } from "@/lib/rbac";
import { supabaseAdmin } from "@/lib/supabase";
import { sendWelcomeEmail } from "@/server/app-emails";

export const dynamic = "force-dynamic";

/** GET /api/onboarding — first-run state + live checklist progress. */
export async function GET() {
  try {
    const s = await requireSession();
    const sb = supabaseAdmin();
    const org = s.internalOrgId;

    const [row, ucAssessed, conns, members, pending, decisions] = await Promise.all([
      sb.from("user_onboarding").select("welcomed_at, checklist_dismissed_at").eq("user_id", s.userId).eq("org_id", org).maybeSingle(),
      sb.from("use_cases").select("id", { count: "exact", head: true }).eq("org_id", org).neq("status", "archived").not("tier", "is", null),
      sb.from("org_connections").select("id", { count: "exact", head: true }).eq("org_id", org).eq("status", "connected"),
      sb.from("memberships").select("id", { count: "exact", head: true }).eq("org_id", org),
      sb.from("pending_invites").select("id", { count: "exact", head: true }).eq("org_id", org),
      sb.from("board_decisions").select("id", { count: "exact", head: true }).eq("org_id", org),
    ]);

    const steps = {
      assessed: (ucAssessed.count ?? 0) > 0,
      connected: (conns.count ?? 0) > 0,
      invited: (members.count ?? 0) > 1 || (pending.count ?? 0) > 0,
      decided: (decisions.count ?? 0) > 0,
    };

    return NextResponse.json({
      welcomed: Boolean(row.data?.welcomed_at),
      dismissed: Boolean(row.data?.checklist_dismissed_at),
      steps,
    });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

/** POST /api/onboarding — { action: "welcome" | "dismiss" }. */
export async function POST(req: NextRequest) {
  try {
    const s = await requireSession();
    const sb = supabaseAdmin();
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const patch: Record<string, unknown> = { user_id: s.userId, org_id: s.internalOrgId };

    // Has this user already been welcomed? (so the welcome email only ever goes out once)
    let firstWelcome = false;
    if (action === "welcome") {
      const { data: existing } = await sb.from("user_onboarding")
        .select("welcomed_at").eq("user_id", s.userId).eq("org_id", s.internalOrgId).maybeSingle();
      firstWelcome = !existing?.welcomed_at;
      patch.welcomed_at = new Date().toISOString();
    } else if (action === "dismiss") {
      patch.checklist_dismissed_at = new Date().toISOString();
    } else {
      throw new ApiError(400, "Unknown action");
    }

    const { error } = await sb.from("user_onboarding").upsert(patch, { onConflict: "user_id,org_id" });
    if (error) throw error;

    // Fire-and-forget the warm welcome, once. Never let email trouble break onboarding.
    if (firstWelcome) {
      try {
        const user = await (await clerkClient()).users.getUser(s.userId);
        const email = user.primaryEmailAddress?.emailAddress
          ?? user.emailAddresses?.[0]?.emailAddress ?? null;
        if (email) await sendWelcomeEmail(email, user.firstName ?? null);
      } catch (e) {
        console.error("welcome email failed", e);
      }
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
