import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * Home-realm discovery: given an email (or domain), is enterprise SSO configured for that domain? Used by
 * the Sky login page to show "SSO configured — continue with SSO" the moment someone types their work
 * email. Returns nothing sensitive. The redirect/callback flow itself is Phase 3.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const email = url.searchParams.get("email") ?? "";
  const domainParam = url.searchParams.get("domain") ?? "";
  const domain = (domainParam || email.split("@")[1] || "").trim().toLowerCase();
  if (!domain || !domain.includes(".")) return NextResponse.json({ configured: false });

  const { data } = await supabaseAdmin()
    .from("sky_sso_connections")
    .select("display_name, enabled, verified_at")
    .ilike("email_domain", domain)
    .maybeSingle();

  // Only advertise SSO for domains the tenant has PROVEN it controls — otherwise claiming someone else's
  // domain would let you point their people at your identity provider.
  if (!data || !data.enabled || !data.verified_at) return NextResponse.json({ configured: false });
  return NextResponse.json({
    configured: true,
    displayName: data.display_name as string,
    startUrl: `/api/sky/auth/sso/start?domain=${encodeURIComponent(domain)}`,
  });
}
