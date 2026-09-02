import { NextResponse } from "next/server";
import { z } from "zod";
import { readChallenge, clearChallenge } from "@/server/sky/mfa-challenge";
import { verifyForUser, consumeRecoveryCode } from "@/server/sky/totp";
import { createSession } from "@/server/sky/session";

export const runtime = "nodejs";

const Body = z.object({
  code: z.string().min(6).max(20),
  /** true when the user is redeeming a recovery code instead of an authenticator code. */
  recovery: z.boolean().optional(),
});

/** Second factor. Only this endpoint creates the session for a 2FA-protected account. */
export async function POST(req: Request) {
  try {
    const challenge = await readChallenge();
    if (!challenge) return NextResponse.json({ error: "Your sign-in request expired. Please sign in again." }, { status: 401 });

    const b = Body.parse(await req.json());
    const ok = b.recovery ? await consumeRecoveryCode(challenge.userId, b.code) : await verifyForUser(challenge.userId, b.code);
    if (!ok) return NextResponse.json({ error: b.recovery ? "That recovery code isn't valid or has already been used." : "That code isn't valid. Check your authenticator and try again." }, { status: 401 });

    await clearChallenge();
    await createSession({ userId: challenge.userId, orgId: challenge.orgId, userAgent: req.headers.get("user-agent") ?? undefined });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Enter the 6-digit code." }, { status: 400 });
    console.error("SKY MFA VERIFY", err);
    return NextResponse.json({ error: "Could not verify the code." }, { status: 500 });
  }
}
