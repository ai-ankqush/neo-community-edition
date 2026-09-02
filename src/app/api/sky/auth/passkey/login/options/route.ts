import { NextResponse } from "next/server";
import { z } from "zod";
import { loginOptions } from "@/server/sky/passkey";

export const runtime = "nodejs";

const Body = z.object({ email: z.string().email().max(200).optional() });

/** Begin passkey login. Email is optional — omit it for usernameless (discoverable credential) sign-in. */
export async function POST(req: Request) {
  try {
    const b = Body.parse(await req.json().catch(() => ({})));
    const options = await loginOptions(b.email);
    return NextResponse.json(options);
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    console.error("PASSKEY LOGIN OPTIONS", err);
    return NextResponse.json({ error: "Could not start sign-in." }, { status: 500 });
  }
}
