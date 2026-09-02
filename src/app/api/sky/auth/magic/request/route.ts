import { NextResponse } from "next/server";
import { z } from "zod";
import { findUserByEmail } from "@/server/sky/accounts";
import { issueMagicLink } from "@/server/sky/magic";

export const runtime = "nodejs";

const Body = z.object({ email: z.string().email().max(200) });

/** Request a sign-in link. Always responds the same way to avoid revealing whether an account exists. */
export async function POST(req: Request) {
  try {
    const b = Body.parse(await req.json());
    const user = await findUserByEmail(b.email);
    let devUrl: string | undefined;
    if (user) {
      const issued = await issueMagicLink(user.userId, b.email, "login");
      devUrl = issued.devUrl;
    }
    return NextResponse.json({ ok: true, devUrl });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    console.error("SKY MAGIC REQUEST", err);
    return NextResponse.json({ error: "Could not send the link." }, { status: 500 });
  }
}
