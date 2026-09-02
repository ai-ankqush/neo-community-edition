import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSkyPrincipal, IdentityError } from "@/server/identity/resolve-sky";
import { verifyAndStoreRegistration } from "@/server/sky/passkey";

export const runtime = "nodejs";

const Body = z.object({
  credentialId: z.string().min(1),
  publicKey: z.string().min(1),
  alg: z.number(),
  transports: z.array(z.string()).optional(),
  clientDataJSON: z.string().min(1),
  label: z.string().max(80).optional(),
});

export async function POST(req: Request) {
  try {
    const principal = await requireSkyPrincipal();
    const b = Body.parse(await req.json());
    const result = await verifyAndStoreRegistration(principal.subjectId, b);
    if (!result.ok) return NextResponse.json({ error: `Registration failed (${result.reason}).` }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof IdentityError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    console.error("PASSKEY REG VERIFY", err);
    return NextResponse.json({ error: "Could not complete registration." }, { status: 500 });
  }
}
