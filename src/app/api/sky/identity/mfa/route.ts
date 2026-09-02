import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { requireSkyPrincipal, IdentityError } from "@/server/identity/resolve-sky";
import { startEnrollment, confirmEnrollment, disableTotp, isTotpEnabled, verifyForUser, regenerateRecoveryCodes, remainingRecoveryCodes } from "@/server/sky/totp";

export const runtime = "nodejs";

const Body = z.object({
  action: z.enum(["start", "confirm", "disable", "regenerate"]),
  code: z.string().min(6).max(20).optional(),
});

/** Status of the caller's own second factor. */
export async function GET() {
  try {
    const p = await requireSkyPrincipal();
    return NextResponse.json({ enabled: await isTotpEnabled(p.subjectId), recoveryRemaining: await remainingRecoveryCodes(p.subjectId) });
  } catch (err) {
    if (err instanceof IdentityError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Could not load 2FA status." }, { status: 500 });
  }
}

/** Enroll, confirm, disable, or re-mint recovery codes — always for the CALLER's own account. */
export async function POST(req: Request) {
  try {
    const p = await requireSkyPrincipal();
    const b = Body.parse(await req.json());

    if (b.action === "start") {
      const { data } = await supabaseAdmin().from("sky_users").select("email").eq("user_id", p.subjectId).maybeSingle();
      const started = await startEnrollment(p.subjectId, (data?.email as string) ?? "user");
      return NextResponse.json(started);
    }

    if (b.action === "confirm") {
      if (!b.code) return NextResponse.json({ error: "Enter the 6-digit code." }, { status: 400 });
      const result = await confirmEnrollment(p.subjectId, b.code);
      if (!result.ok) return NextResponse.json({ error: "That code isn't valid. Try the next one your app shows." }, { status: 400 });
      return NextResponse.json({ ok: true, recoveryCodes: result.recoveryCodes });
    }

    // Disabling or re-minting requires a fresh code — possession, not just an open session.
    if (!b.code || !(await verifyForUser(p.subjectId, b.code))) {
      return NextResponse.json({ error: "Enter a current code from your authenticator to confirm." }, { status: 401 });
    }
    if (b.action === "disable") {
      await disableTotp(p.subjectId);
      return NextResponse.json({ ok: true, enabled: false });
    }
    return NextResponse.json({ ok: true, recoveryCodes: await regenerateRecoveryCodes(p.subjectId) });
  } catch (err) {
    if (err instanceof IdentityError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    console.error("SKY MFA", err);
    return NextResponse.json({ error: "Could not update 2FA." }, { status: 500 });
  }
}
