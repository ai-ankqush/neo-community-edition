import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/partner-heartbeat  (Vercel Cron, hourly — see vercel.json; CRON_SECRET-protected)
 * Runs on EVERY deployment of the shared codebase but only DOES anything on a partner deployment
 * (PARTNER_KEY set). It computes aggregate metrics from the partner's OWN database and POSTs them to
 * the owner instance's /api/partners/heartbeat. Only counts leave — never tenant content. On the owner
 * instance (no PARTNER_KEY) it no-ops.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const key = process.env.PARTNER_KEY;
  if (!key) return NextResponse.json({ skipped: "not a partner deployment" });

  const sb = supabaseAdmin();
  const since30 = new Date(Date.now() - 30 * 86400_000).toISOString();
  const period = new Date().toISOString().slice(0, 7); // YYYY-MM
  const [{ data: orgs }, { data: usage }, { data: ucs }] = await Promise.all([
    sb.from("organizations").select("id, name, plan, created_at, deleted_at, is_demo"),
    sb.from("usage_records").select("period, input_tokens, output_tokens, assessments_run"),
    sb.from("use_cases").select("org_id, status"),
  ]);

  const live = (orgs ?? []).filter((o) => !o.deleted_at && !o.is_demo);
  const tok = (u: { input_tokens: number | string; output_tokens: number | string }) =>
    Number(u.input_tokens) + Number(u.output_tokens);
  const ucCount = (orgId: string) => (ucs ?? []).filter((u) => u.org_id === orgId && u.status !== "archived").length;
  const metrics = {
    orgs: live.length,
    newOrgs30d: live.filter((o) => (o.created_at as string) >= since30).length,
    assessments: (usage ?? []).reduce((a, u) => a + Number(u.assessments_run), 0),
    tokensMonth: (usage ?? []).filter((u) => u.period === period).reduce((a, u) => a + tok(u), 0),
    tokensAllTime: (usage ?? []).reduce((a, u) => a + tok(u), 0),
  };
  // Per-customer breakdown for the owner's revenue-share reconciliation.
  const customers = live.map((o) => ({
    name: (o.name as string) || "(unnamed)",
    plan: (o.plan as string) || "trial",
    useCases: ucCount(o.id as string),
  }));

  const base = process.env.PARTNER_STATUS_URL || "https://app.neocontrol.ai";
  try {
    const r = await fetch(`${base}/api/partners/heartbeat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, metrics, customers }),
    });
    return NextResponse.json({ sent: r.ok, metrics, customerCount: customers.length });
  } catch {
    return NextResponse.json({ sent: false, metrics });
  }
}
