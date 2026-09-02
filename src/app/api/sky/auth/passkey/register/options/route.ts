import { NextResponse } from "next/server";
import { requireSkyPrincipal, IdentityError } from "@/server/identity/resolve-sky";
import { registrationOptions } from "@/server/sky/passkey";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

/** Begin passkey registration for the signed-in user. */
export async function POST() {
  try {
    const principal = await requireSkyPrincipal();
    const { data } = await supabaseAdmin().from("sky_users").select("email, display_name").eq("user_id", principal.subjectId).maybeSingle();
    const options = await registrationOptions(principal.subjectId, (data?.email as string) ?? "", (data?.display_name as string) ?? null);
    return NextResponse.json(options);
  } catch (err) {
    if (err instanceof IdentityError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("PASSKEY REG OPTIONS", err);
    return NextResponse.json({ error: "Could not start registration." }, { status: 500 });
  }
}
