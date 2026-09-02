import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { clerkClient } from "@clerk/nextjs/server";
import { requireRole, ApiError } from "@/lib/rbac";
import { supabaseAdmin } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";

const PatchBody = z.object({
  email: z.string().email(),
  role: z.enum(["org_admin", "assessor", "contributor", "viewer"]),
});

/** PATCH /api/members/pending - change the platform role a pending invitee will
 *  get when they join (org_admin). */
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireRole("org_admin");
    const { email, role } = PatchBody.parse(await req.json());
    const sb = supabaseAdmin();
    const { error } = await sb.from("pending_invites").upsert(
      { org_id: session.internalOrgId, email: email.toLowerCase(), role, invited_by: session.userId },
      { onConflict: "org_id,email" }
    );
    if (error) throw error;
    await logAudit({ orgId: session.internalOrgId, actor: session.userId, action: "member.invite_role_change", detail: { email, role } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handle(err);
  }
}

const DeleteBody = z.object({ invitationId: z.string().min(1), email: z.string().email() });

/** DELETE /api/members/pending - revoke a pending invitation (org_admin). */
export async function DELETE(req: NextRequest) {
  try {
    const session = await requireRole("org_admin");
    const { invitationId, email } = DeleteBody.parse(await req.json());
    const client = await clerkClient();
    try {
      await client.organizations.revokeOrganizationInvitation({
        organizationId: session.orgId, invitationId, requestingUserId: session.userId,
      });
    } catch (e) {
      const ce = e as { errors?: { message?: string }[]; message?: string };
      throw new ApiError(400, ce?.errors?.[0]?.message || ce?.message || "Could not revoke invitation");
    }
    await supabaseAdmin().from("pending_invites").delete().eq("org_id", session.internalOrgId).eq("email", email.toLowerCase());
    await logAudit({ orgId: session.internalOrgId, actor: session.userId, action: "member.invite_revoked", detail: { email } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handle(err);
  }
}

function handle(err: unknown) {
  if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
  console.error("PENDING INVITE ERROR", err);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}
