import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSkyPrincipal, IdentityError } from "@/server/identity/resolve-sky";
import { getConnection, upsertConnection, deleteConnection, probeIssuer } from "@/server/sky/sso-admin";
import { requirePermission, AuthzError } from "@/server/authz/authorize";
import { IDENTITY } from "@/server/authz/permissions";

export const runtime = "nodejs";

const Body = z.object({
  emailDomain: z.string().min(3).max(200),
  displayName: z.string().min(1).max(80),
  issuer: z.string().min(8).max(300),
  clientId: z.string().max(300).optional(),
  clientSecret: z.string().max(500).optional(),
  enabled: z.boolean().optional(),
});

export async function GET() {
  try {
    const p = await requireSkyPrincipal();
    await requirePermission(p, IDENTITY[0]); // identity:read
    return NextResponse.json({ connection: await getConnection(p.tenantId) });
  } catch (err) {
    if (err instanceof IdentityError || err instanceof AuthzError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Could not load the connection." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const p = await requireSkyPrincipal();
    await requirePermission(p, IDENTITY[1]); // identity:manage
    const b = Body.parse(await req.json());
    const connection = await upsertConnection(p.tenantId, b);
    const probe = await probeIssuer(b.issuer);
    return NextResponse.json({ connection, probe });
  } catch (err) {
    if (err instanceof IdentityError || err instanceof AuthzError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not save." }, { status: 400 });
  }
}

export async function DELETE() {
  try {
    const p = await requireSkyPrincipal();
    await requirePermission(p, IDENTITY[1]);
    await deleteConnection(p.tenantId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof IdentityError || err instanceof AuthzError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Could not remove the connection." }, { status: 500 });
  }
}
