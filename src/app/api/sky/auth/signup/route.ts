import { NextResponse } from "next/server";
import { z } from "zod";
import { createAccount, findUserByEmail } from "@/server/sky/accounts";
import { issueMagicLink } from "@/server/sky/magic";
import { createSession } from "@/server/sky/session";
import { AUTH_PROVIDER } from "@/ce/auth-provider";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

const Body = z.object({
  email: z.string().email().max(200),
  displayName: z.string().max(120).optional(),
  orgName: z.string().max(120).optional(),
  method: z.enum(["password", "magic"]),
  password: z.string().min(10).max(200).optional(),
});

export async function POST(req: Request) {
  try {
    const b = Body.parse(await req.json());
    if (b.method === "password" && !b.password) {
      return NextResponse.json({ error: "Password is required." }, { status: 400 });
    }
    if (await findUserByEmail(b.email)) {
      return NextResponse.json({ error: "An account already exists for that email. Try signing in." }, { status: 409 });
    }

    // Community Edition (AUTH_PROVIDER=builtin) has no email round-trip requirement: a self-host
    // install may have no SMTP, so a password sign-up verifies + signs in immediately.
    const ceInstant = AUTH_PROVIDER === "builtin" && b.method === "password";

    const { userId, orgId } = await createAccount({
      email: b.email,
      displayName: b.displayName,
      orgName: b.orgName,
      password: b.method === "password" ? b.password : undefined,
      emailVerified: ceInstant,
    });

    if (ceInstant) {
      await createSession({ userId, orgId });
      // First account on a fresh install → send them through the setup/onboarding screen.
      const { count } = await supabaseAdmin().from("sky_users").select("user_id", { count: "exact", head: true });
      const firstRun = (count ?? 1) <= 1;
      return NextResponse.json({ ok: true, signedIn: true, firstRun });
    }

    // Both methods verify the email before first sign-in. Password is stored now; the emailed link
    // confirms ownership and establishes the session on click.
    const purpose = b.method === "password" ? "verify" : "login";
    const issued = await issueMagicLink(userId, b.email, purpose);
    return NextResponse.json({ ok: true, signedIn: false, emailSent: issued.sent, devUrl: issued.devUrl });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid input", issues: err.issues }, { status: 400 });
    console.error("SKY SIGNUP", err);
    // CE (self-host) surfaces the real reason so the operator can fix their setup; hosted stays generic.
    const detail = AUTH_PROVIDER === "builtin" && err instanceof Error ? err.message : undefined;
    return NextResponse.json({ error: "Could not create the account.", ...(detail ? { detail } : {}) }, { status: 500 });
  }
}
