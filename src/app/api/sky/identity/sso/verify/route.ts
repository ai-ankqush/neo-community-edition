import { NextResponse } from "next/server";
import { requireSkyPrincipal, IdentityError } from "@/server/identity/resolve-sky";
import { verifyDomain } from "@/server/sky/sso-admin";
import { requirePermission, AuthzError } from "@/server/authz/authorize";
import { IDENTITY } from "@/server/authz/permissions";

export const runtime = "nodejs";

/** Check the _neo-verify DNS TXT record and mark the domain verified when it matches. */
export async function POST() {
  try {
    const p = await requireSkyPrincipal();
    await requirePermission(p, IDENTITY[1]);
    const result = await verifyDomain(p.tenantId);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof IdentityError || err instanceof AuthzError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Verification failed." }, { status: 400 });
  }
}
