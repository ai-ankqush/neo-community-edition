import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public: has any account been created yet? Used to route a fresh install to sign-up
// (first user = admin) instead of "welcome back". Fails safe to hasUsers:true.
export async function GET() {
  try {
    const { count } = await supabaseAdmin().from("sky_users").select("*", { count: "exact", head: true });
    return NextResponse.json({ hasUsers: (count ?? 0) > 0 });
  } catch {
    return NextResponse.json({ hasUsers: true });
  }
}
