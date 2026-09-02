import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSkyPrincipal, IdentityError } from "@/server/identity/resolve-sky";
import { deletePasskey } from "@/server/sky/passkey";

export const runtime = "nodejs";

const Body = z.object({ credentialId: z.string().uuid() });

export async function POST(req: Request) {
  try {
    const principal = await requireSkyPrincipal();
    const b = Body.parse(await req.json());
    await deletePasskey(principal.subjectId, b.credentialId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof IdentityError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    return NextResponse.json({ error: "Could not remove passkey." }, { status: 500 });
  }
}
