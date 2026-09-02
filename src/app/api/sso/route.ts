import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { clerkClient } from "@clerk/nextjs/server";
import { requireRole, ApiError } from "@/lib/rbac";
import { supabaseAdmin } from "@/lib/supabase";
import { planFor } from "@/lib/plans";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// Same inbox the support form uses — Neo gets the request by email and then
// provisions the Clerk enterprise connection.
const FORMSPREE = "https://formspree.io/f/xqeoeydk";

const Body = z.object({
  idpType: z.enum(["okta", "entra", "google", "saml", "oidc", "other"]),
  emailDomains: z.string().min(3).max(300),
  metadataUrl: z.string().max(500).optional().default(""),
  contactEmail: z.string().email().optional().or(z.literal("")).default(""),
  notes: z.string().max(1000).optional().default(""),
});

async function gate() {
  const session = await requireRole("org_admin");
  const sb = supabaseAdmin();
  const { data: org } = await sb.from("organizations").select("plan, name").eq("id", session.internalOrgId).single();
  if (!planFor(org?.plan).sso) {
    throw new ApiError(402, "Single Sign-On is an Enterprise feature.");
  }
  return { session, sb, orgName: org?.name ?? "—" };
}

/** GET /api/sso — current SSO config/status for the org (admin only). */
export async function GET() {
  try {
    const { session, sb } = await gate();
    const { data } = await sb.from("sso_configs").select("*").eq("org_id", session.internalOrgId).maybeSingle();
    return NextResponse.json({ config: data ?? null });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("SSO GET ERROR", err);
    return NextResponse.json({ error: "Could not load SSO config" }, { status: 500 });
  }
}

/** POST /api/sso — submit/update an SSO setup request (admin only, Enterprise). */
export async function POST(req: NextRequest) {
  try {
    const { session, sb, orgName } = await gate();
    const body = Body.parse(await req.json());

    // requester email for the notification
    let requesterEmail = "";
    try {
      const client = await clerkClient();
      const u = await client.users.getUser(session.userId);
      requesterEmail = u.primaryEmailAddress?.emailAddress ?? "";
    } catch {
      // best-effort
    }

    // keep an existing 'active' status; new submissions while inactive => 'requested'
    const { data: existing } = await sb.from("sso_configs").select("status").eq("org_id", session.internalOrgId).maybeSingle();
    const status = existing?.status === "active" ? "active" : "requested";

    const { error } = await sb.from("sso_configs").upsert(
      {
        org_id: session.internalOrgId,
        status,
        idp_type: body.idpType,
        email_domains: body.emailDomains,
        metadata_url: body.metadataUrl,
        contact_email: body.contactEmail,
        notes: body.notes,
        requested_by: session.userId,
        requested_at: new Date().toISOString(),
      },
      { onConflict: "org_id" }
    );
    if (error) throw error;

    await logAudit({
      orgId: session.internalOrgId,
      actor: session.userId,
      action: "sso.request",
      detail: { idpType: body.idpType, emailDomains: body.emailDomains },
    });

    // email Neo so it lands in the support inbox for provisioning
    try {
      await fetch(FORMSPREE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          _subject: `Neo SSO setup request — ${orgName}`,
          organization: orgName,
          internalOrgId: session.internalOrgId,
          clerkOrgId: session.orgId,
          requestedBy: requesterEmail,
          idpType: body.idpType,
          emailDomains: body.emailDomains,
          metadataUrl: body.metadataUrl || "(to be provided)",
          contactEmail: body.contactEmail,
          notes: body.notes,
        }),
      });
    } catch {
      // notification is best-effort; the DB row is the source of truth
    }

    return NextResponse.json({ ok: true, status });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error("SSO POST ERROR", err);
    return NextResponse.json({ error: "Could not submit SSO request" }, { status: 500 });
  }
}
