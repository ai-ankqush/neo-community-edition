import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSkyPrincipal, IdentityError } from "@/server/identity/resolve-sky";
import { listServiceKeys, issueServiceKey, revokeServiceKey } from "@/server/sky/service-keys";
import { requirePermission, AuthzError } from "@/server/authz/authorize";
import { IDENTITY } from "@/server/authz/permissions";
import { assignRole } from "@/server/authz/authorize";
import { SYSTEM_ROLE_KEYS } from "@/server/authz/roles";

export const runtime = "nodejs";

const CreateBody = z.object({
  name: z.string().min(1).max(80),
  roleKey: z.enum(SYSTEM_ROLE_KEYS as [string, ...string[]]).optional(),
});
const RevokeBody = z.object({ keyId: z.string().uuid() });

export async function GET() {
  try {
    const p = await requireSkyPrincipal();
    await requirePermission(p, IDENTITY[0]);
    return NextResponse.json({ keys: await listServiceKeys(p.tenantId) });
  } catch (err) {
    if (err instanceof IdentityError || err instanceof AuthzError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Could not list keys." }, { status: 500 });
  }
}

/** Issue a key. The plaintext token is returned ONCE and never retrievable again. */
export async function POST(req: Request) {
  try {
    const p = await requireSkyPrincipal();
    await requirePermission(p, IDENTITY[1]);
    const b = CreateBody.parse(await req.json());
    const issued = await issueServiceKey({ orgId: p.tenantId, name: b.name, roleKey: b.roleKey, createdBy: p.subjectId });
    // Durable assignment so the key's authority is visible and revocable in the access model.
    await assignRole({ orgId: p.tenantId, principalType: "service_key", principalId: issued.keyId, roleKey: b.roleKey ?? "operator", grantedBy: p.subjectId });
    return NextResponse.json(issued);
  } catch (err) {
    if (err instanceof IdentityError || err instanceof AuthzError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    return NextResponse.json({ error: "Could not create the key." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const p = await requireSkyPrincipal();
    await requirePermission(p, IDENTITY[1]);
    const b = RevokeBody.parse(await req.json());
    await revokeServiceKey(p.tenantId, b.keyId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof IdentityError || err instanceof AuthzError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    return NextResponse.json({ error: "Could not revoke the key." }, { status: 500 });
  }
}
