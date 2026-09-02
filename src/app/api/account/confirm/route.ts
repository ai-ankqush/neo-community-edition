import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

function page(title: string, body: string): NextResponse {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;background:#060a14;color:#e8edf5;font-family:Inter,-apple-system,Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center">
<div style="max-width:460px;padding:40px;text-align:center">
<div style="font-size:20px;font-weight:800;margin-bottom:8px">Neo</div>
<h1 style="font-size:22px;margin:18px 0 8px">${title}</h1>
<p style="color:#6a7d9b;line-height:1.6;font-size:15px">${body}</p>
<a href="https://app.neocontrol.ai/dashboard" style="display:inline-block;margin-top:22px;padding:12px 24px;background:#06d6d6;color:#060a14;border-radius:6px;font-weight:700;text-decoration:none">Open Neo</a>
</div></body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html" } });
}

/** GET /api/account/confirm?token=... - keep a dormant account alive. Public,
 *  token-based (the owner clicks it from the warning email; no login needed). */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return page("Invalid link", "This confirmation link is missing its token.");

  const sb = supabaseAdmin();
  const { data: org } = await sb.from("organizations").select("id, name").eq("confirm_token", token).maybeSingle();
  if (!org) {
    return page("Link expired", "This link is no longer valid. If your account was kept active, you can sign in normally. Otherwise, sign up again any time.");
  }

  await sb
    .from("organizations")
    .update({ last_active_at: new Date().toISOString(), dormancy_warned_at: null, confirm_token: null })
    .eq("id", org.id);

  await logAudit({ orgId: org.id, actor: "account_owner", action: "account.confirmed_active", objectType: "organization", objectId: org.id });

  return page("You're all set", `Your workspace <strong>${org.name}</strong> will stay active. Thanks for confirming — see you in Neo.`);
}
