import { NextResponse } from "next/server";
import { z } from "zod";
import { findUserByEmail } from "@/server/sky/accounts";
import { issueMagicLink } from "@/server/sky/magic";

export const runtime = "nodejs";

const Body = z.object({ email: z.string().email().max(200) });

/** Request a password reset. Uniform response — never reveals whether the account exists. */
export async function POST(req: Request) {
  try {
    const b = Body.parse(await req.json());
    const user = await findUserByEmail(b.email);
    let devUrl: string | undefined;
    // Any existing account can request a reset link — it lets a passwordless (magic-link/SSO) user set a
    // password too. Reset itself is enumeration-safe because the response is uniform.
    if (user) {
      const issued = await issueMagicLink(user.userId, b.email, "reset");
      devUrl = issued.devUrl;
    }
    return NextResponse.json({ ok: true, devUrl });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    console.error("SKY FORGOT", err);
    return NextResponse.json({ error: "Could not process the request." }, { status: 500 });
  }
}
