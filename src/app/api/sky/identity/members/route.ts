import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSkyPrincipal, IdentityError } from "@/server/identity/resolve-sky";
import { requirePermission, AuthzError, assignRole, revokeRole, availableRoles, describeAccess } from "@/server/authz/authorize";
import { MEMBERS } from "@/server/authz/permissions";
import { listMembers } from "@/server/sky/members";

export const runtime = "nodejs";

const Body = z.object({
  userId: z.string().uuid(),
  roleKey: z.string().min(2).max(60),
  action: z.enum(["assign", "revoke"]),
});

/** Members, the roles they hold, the roles available, and the caller's own effective permissions. */
export async function GET() {
  try {
    const p = await requireSkyPrincipal();
    await requirePermission(p, MEMBERS[0]); // members:read
    const [members, roles, access] = await Promise.all([listMembers(p.tenantId), availableRoles(p.tenantId), describeAccess(p)]);
    return NextResponse.json({ members, roles, myPermissions: access.permissions, me: p.subjectId });
  } catch (err) {
    if (err instanceof IdentityError || err instanceof AuthzError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Could not load members." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const p = await requireSkyPrincipal();
    await requirePermission(p, MEMBERS[1]); // members:manage
    const b = Body.parse(await req.json());

    // Don't let an admin strip their own last powerful role and lock the tenant out of its own settings.
    if (b.action === "revoke" && b.userId === p.subjectId && ["owner", "admin"].includes(b.roleKey)) {
      return NextResponse.json({ error: "You can't remove your own admin role. Ask another admin to do it." }, { status: 400 });
    }

    if (b.action === "assign") await assignRole({ orgId: p.tenantId, principalType: "user", principalId: b.userId, roleKey: b.roleKey, grantedBy: p.subjectId });
    else await revokeRole({ orgId: p.tenantId, principalType: "user", principalId: b.userId, roleKey: b.roleKey });

    return NextResponse.json({ ok: true, members: await listMembers(p.tenantId) });
  } catch (err) {
    if (err instanceof IdentityError || err instanceof AuthzError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    return NextResponse.json({ error: "Could not update roles." }, { status: 500 });
  }
}
