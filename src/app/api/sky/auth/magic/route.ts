import { NextResponse } from "next/server";
import { consumeMagicLink } from "@/server/sky/magic";
import { primaryOrgForUser } from "@/server/sky/accounts";
import { createSession } from "@/server/sky/session";

export const runtime = "nodejs";

/** Consume a magic link (GET from the email), establish a Sky session, redirect into the portal. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const base = process.env.SKY_BASE_URL ?? url.origin;

  if (!token) return NextResponse.redirect(`${base}/login?error=invalid_link`);

  const result = await consumeMagicLink(token, ["login", "verify"]);
  if (!result) return NextResponse.redirect(`${base}/login?error=expired_link`);

  const orgId = await primaryOrgForUser(result.userId);
  if (!orgId) return NextResponse.redirect(`${base}/login?error=no_org`);

  await createSession({ userId: result.userId, orgId, userAgent: req.headers.get("user-agent") ?? undefined });
  return NextResponse.redirect(base);
}
