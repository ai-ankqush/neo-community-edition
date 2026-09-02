import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { clerkClient } from "@clerk/nextjs/server";
import { requireSession, requireRole, ApiError } from "@/lib/rbac";
import { supabaseAdmin } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";

/** GET /api/members - org members (Clerk) joined with platform roles (ours). */
export async function GET() {
  try {
    const session = await requireSession();
    const client = await clerkClient();

    const [{ data: clerkMembers }, { data: roles }] = await Promise.all([
      client.organizations.getOrganizationMembershipList({
        organizationId: session.orgId,
        limit: 100,
      }),
      supabaseAdmin()
        .from("memberships")
        .select("user_id, role")
        .eq("org_id", session.internalOrgId),
    ]);

    const roleMap = new Map((roles ?? []).map((r) => [r.user_id, r.role]));

    // apply any pending invite roles for members who have now joined
    const { data: pending } = await supabaseAdmin()
      .from("pending_invites").select("email, role").eq("org_id", session.internalOrgId);
    if (pending && pending.length) {
      const byEmail = new Map(pending.map((p) => [p.email.toLowerCase(), p.role]));
      const apply: { user_id: string; role: string; email: string }[] = [];
      for (const m of clerkMembers) {
        const email = (m.publicUserData?.identifier ?? "").toLowerCase();
        const uid = m.publicUserData?.userId;
        if (email && uid && byEmail.has(email) && !roleMap.has(uid)) {
          apply.push({ user_id: uid, role: byEmail.get(email)!, email });
        }
      }
      if (apply.length) {
        const sb = supabaseAdmin();
        await sb.from("memberships").upsert(
          apply.map((a) => ({
            org_id: session.internalOrgId, user_id: a.user_id, role: a.role,
            updated_by: "invite", updated_at: new Date().toISOString(),
          })),
          { onConflict: "org_id,user_id" }
        );
        await sb.from("pending_invites").delete().eq("org_id", session.internalOrgId)
          .in("email", apply.map((a) => a.email));
        for (const a of apply) roleMap.set(a.user_id, a.role);
      }
    }

    const members = clerkMembers.map((m) => {
      const u = m.publicUserData;
      const uid = u?.userId ?? "";
      const clerkAdmin = m.role === "org:admin";
      // membership row wins; else a Clerk admin is the bootstrap owner
      const platformRole = roleMap.get(uid) ?? (clerkAdmin ? "org_admin" : "viewer");
      return {
        userId: uid,
        name: [u?.firstName, u?.lastName].filter(Boolean).join(" ") || u?.identifier || "Member",
        email: u?.identifier ?? "",
        imageUrl: u?.imageUrl ?? null,
        clerkRole: m.role,
        platformRole,
        isSelf: uid === session.userId,
      };
    });

    // pending (not-yet-accepted) invitations, with the platform role they'll get on join
    let pendingInvites: { id: string; email: string; role: string }[] = [];
    try {
      const inv = await client.organizations.getOrganizationInvitationList({
        organizationId: session.orgId, status: ["pending"], limit: 100,
      });
      const list = inv?.data ?? [];
      const roleByEmail = new Map((pending ?? []).map((p) => [p.email.toLowerCase(), p.role]));
      pendingInvites = list.map((iv) => ({
        id: iv.id,
        email: iv.emailAddress ?? "",
        role: roleByEmail.get((iv.emailAddress ?? "").toLowerCase()) ?? "viewer",
      }));
    } catch {
      /* invitation list unavailable — show members only */
    }

    return NextResponse.json({ members, pendingInvites, canManage: session.role === "org_admin" });
  } catch (err) {
    return handle(err);
  }
}

const SetRole = z.object({
  userId: z.string().min(1),
  role: z.enum(["org_admin", "assessor", "contributor", "viewer"]),
});

/** PATCH /api/members - set a member's platform role (org_admin only). */
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireRole("org_admin");
    const body = SetRole.parse(await req.json());

    const { error } = await supabaseAdmin()
      .from("memberships")
      .upsert(
        {
          org_id: session.internalOrgId,
          user_id: body.userId,
          role: body.role,
          updated_by: session.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "org_id,user_id" }
      );
    if (error) throw error;

    await logAudit({
      orgId: session.internalOrgId,
      actor: session.userId,
      action: "member.role_change",
      objectType: "membership",
      objectId: body.userId,
      detail: { role: body.role },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handle(err);
  }
}

const InviteBody = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "assessor", "contributor", "viewer"]),
});

/** POST /api/members - invite a user with a pre-assigned platform role (admin only). */
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole("org_admin");
    const body = InviteBody.parse(await req.json());
    const client = await clerkClient();

    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.neocontrol.ai";
      await client.organizations.createOrganizationInvitation({
        organizationId: session.orgId,
        inviterUserId: session.userId,
        emailAddress: body.email,
        role: "org:admin", // only role on Clerk free; the platform role below governs permissions
        redirectUrl: `${appUrl}/sign-up`, // accept link lands on the app sign-up with the invite ticket
      });
    } catch (e) {
      const ce = e as { errors?: { longMessage?: string; message?: string }[]; message?: string };
      const msg = ce?.errors?.[0]?.longMessage || ce?.errors?.[0]?.message || ce?.message || "Clerk rejected the invitation";
      throw new ApiError(400, `Invite failed: ${msg}`);
    }

    // stash the chosen platform role; applied to memberships when they join
    const platformRole = body.role === "admin" ? "org_admin" : body.role;
    await supabaseAdmin().from("pending_invites").upsert(
      { org_id: session.internalOrgId, email: body.email.toLowerCase(), role: platformRole, invited_by: session.userId },
      { onConflict: "org_id,email" }
    );

    await logAudit({
      orgId: session.internalOrgId, actor: session.userId,
      action: "member.invited", detail: { email: body.email, role: body.role },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handle(err);
  }
}

const DeleteBody = z.object({ userId: z.string().min(1) });

/** DELETE /api/members - remove a member from the org (admin only). */
export async function DELETE(req: NextRequest) {
  try {
    const session = await requireRole("org_admin");
    const { userId } = DeleteBody.parse(await req.json());
    if (userId === session.userId) throw new ApiError(400, "You can't remove yourself.");

    const client = await clerkClient();
    try {
      await client.organizations.deleteOrganizationMembership({ organizationId: session.orgId, userId });
    } catch (e) {
      const ce = e as { errors?: { message?: string }[]; message?: string };
      throw new ApiError(400, ce?.errors?.[0]?.message || ce?.message || "Could not remove member");
    }
    await supabaseAdmin().from("memberships").delete().eq("org_id", session.internalOrgId).eq("user_id", userId);
    await logAudit({ orgId: session.internalOrgId, actor: session.userId, action: "member.removed", objectType: "membership", objectId: userId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handle(err);
  }
}

function handle(err: unknown) {
  if (err instanceof ApiError)
    return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof z.ZodError)
    return NextResponse.json({ error: err.issues }, { status: 400 });
  console.error(err);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}
