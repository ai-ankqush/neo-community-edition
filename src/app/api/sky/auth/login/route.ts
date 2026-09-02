import { NextResponse } from "next/server";
import { z } from "zod";
import { findUserByEmail, getPasswordHash, primaryOrgForUser } from "@/server/sky/accounts";
import { verifyPassword } from "@/server/sky/password";
import { createSession } from "@/server/sky/session";
import { issueMagicLink } from "@/server/sky/magic";
import { isTotpEnabled } from "@/server/sky/totp";
import { issueChallenge } from "@/server/sky/mfa-challenge";

export const runtime = "nodejs";

const Body = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

export async function POST(req: Request) {
  try {
    const b = Body.parse(await req.json());
    // Uniform failure — never reveal whether the email exists or which factor failed.
    const invalid = () => NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });

    const user = await findUserByEmail(b.email);
    if (!user) return invalid();
    const hash = await getPasswordHash(user.userId);
    if (!hash) return invalid();
    if (!(await verifyPassword(b.password, hash))) return invalid();

    // Correct password but unverified email — don't sign in; re-send the verification link.
    if (!user.emailVerified) {
      await issueMagicLink(user.userId, user.email, "verify");
      return NextResponse.json({ error: "Please verify your email. We've sent you a new link.", needsVerification: true }, { status: 403 });
    }

    const orgId = await primaryOrgForUser(user.userId);
    if (!orgId) return invalid();

    // Second factor: the password alone never yields a session.
    if (await isTotpEnabled(user.userId)) {
      await issueChallenge(user.userId, orgId);
      return NextResponse.json({ ok: false, mfaRequired: true });
    }

    await createSession({ userId: user.userId, orgId, userAgent: req.headers.get("user-agent") ?? undefined });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    console.error("SKY LOGIN", err);
    return NextResponse.json({ error: "Could not sign in." }, { status: 500 });
  }
}
