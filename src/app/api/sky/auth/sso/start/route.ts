import { NextResponse } from "next/server";
import { getConnectionByDomain, beginSso } from "@/server/sky/oidc-rp";

export const runtime = "nodejs";

/** Begin enterprise SSO for a domain: redirect the browser to the customer's IdP. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = process.env.SKY_BASE_URL ?? url.origin;
  const domain = (url.searchParams.get("domain") ?? "").trim().toLowerCase();
  if (!domain) return NextResponse.redirect(`${base}/login?error=sso_no_domain`);

  try {
    const conn = await getConnectionByDomain(domain);
    if (!conn || !conn.enabled) return NextResponse.redirect(`${base}/login?error=sso_not_configured`);
    const authUrl = await beginSso(conn);
    return NextResponse.redirect(authUrl);
  } catch (err) {
    console.error("SKY SSO START", err);
    return NextResponse.redirect(`${base}/login?error=sso_failed`);
  }
}
