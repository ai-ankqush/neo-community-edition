import { NextResponse } from "next/server";
import { completeSso } from "@/server/sky/oidc-rp";
import { createSession } from "@/server/sky/session";

export const runtime = "nodejs";

/** IdP redirect target: validate + exchange, then establish the Sky session and land the user home. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = process.env.SKY_BASE_URL ?? url.origin;

  const error = url.searchParams.get("error");
  if (error) return NextResponse.redirect(`${base}/login?error=sso_denied`);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return NextResponse.redirect(`${base}/login?error=sso_failed`);

  try {
    const result = await completeSso(code, state);
    if (!result.ok || !result.userId || !result.orgId) return NextResponse.redirect(`${base}/login?error=sso_failed`);
    await createSession({ userId: result.userId, orgId: result.orgId, userAgent: req.headers.get("user-agent") ?? undefined });
    return NextResponse.redirect(base);
  } catch (err) {
    console.error("SKY SSO CALLBACK", err);
    return NextResponse.redirect(`${base}/login?error=sso_failed`);
  }
}
