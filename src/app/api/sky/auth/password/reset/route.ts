import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { consumeMagicLink } from "@/server/sky/magic";
import { setPasswordCredential, primaryOrgForUser } from "@/server/sky/accounts";
import { createSession } from "@/server/sky/session";

export const runtime = "nodejs";

const Body = z.object({
  token: z.string().min(10),
  password: z.string().min(10).max(200),
});

/** Consume a reset token (single-use), set the new password, and sign the user in. */
export async function POST(req: Request) {
  try {
    const b = Body.parse(await req.json());
    const result = await consumeMagicLink(b.token, ["reset"]);
    if (!result) return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });

    await setPasswordCredential(result.userId, b.password);
    // Controlling the reset link proves email ownership — clear any unverified state so login isn't blocked.
    await supabaseAdmin().from("sky_users").update({ email_verified: true }).eq("user_id", result.userId).eq("email_verified", false);

    const orgId = await primaryOrgForUser(result.userId);
    if (orgId) await createSession({ userId: result.userId, orgId, userAgent: req.headers.get("user-agent") ?? undefined });
    return NextResponse.json({ ok: true, signedIn: !!orgId });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Password must be at least 10 characters." }, { status: 400 });
    console.error("SKY RESET", err);
    return NextResponse.json({ error: "Could not reset the password." }, { status: 500 });
  }
}
