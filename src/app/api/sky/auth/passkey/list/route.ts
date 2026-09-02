import { NextResponse } from "next/server";
import { requireSkyPrincipal, IdentityError } from "@/server/identity/resolve-sky";
import { listPasskeys } from "@/server/sky/passkey";

export const runtime = "nodejs";

export async function GET() {
  try {
    const principal = await requireSkyPrincipal();
    const passkeys = await listPasskeys(principal.subjectId);
    return NextResponse.json({ passkeys });
  } catch (err) {
    if (err instanceof IdentityError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Could not list passkeys." }, { status: 500 });
  }
}
