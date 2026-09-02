import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyLogin } from "@/server/sky/passkey";
import { primaryOrgForUser } from "@/server/sky/accounts";
import { createSession } from "@/server/sky/session";

export const runtime = "nodejs";

const Body = z.object({
  credentialId: z.string().min(1),
  authenticatorData: z.string().min(1),
  clientDataJSON: z.string().min(1),
  signature: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const b = Body.parse(await req.json());
    const result = await verifyLogin(b);
    if (!result.ok || !result.userId) return NextResponse.json({ error: "Passkey sign-in failed." }, { status: 401 });

    const orgId = await primaryOrgForUser(result.userId);
    if (!orgId) return NextResponse.json({ error: "No workspace attached to this account." }, { status: 403 });

    await createSession({ userId: result.userId, orgId, userAgent: req.headers.get("user-agent") ?? undefined });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    console.error("PASSKEY LOGIN VERIFY", err);
    return NextResponse.json({ error: "Could not sign in." }, { status: 500 });
  }
}
