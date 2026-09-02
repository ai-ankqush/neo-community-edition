import { NextResponse } from "next/server";
import { getAuthContext } from "@/server/identity/auth-context";
import { supabaseAdmin } from "@/lib/supabase";
import { activeNudge } from "@/server/sentinel/sentinel";

/** Polled by the in-app Sentinel watcher. Returns whether there's a live nudge for
 *  this actor right now (and why). Cheap + best-effort. */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { userId, orgId, internalOrgId } = await getAuthContext();
    if (!userId || !orgId || !internalOrgId) return NextResponse.json({ active: false });
    const { data: org } = await supabaseAdmin().from("organizations").select("is_demo").eq("id", internalOrgId).single();
    if (!org?.is_demo) return NextResponse.json({ active: false });
    const nudge = await activeNudge(internalOrgId, userId);
    return NextResponse.json(nudge);
  } catch {
    return NextResponse.json({ active: false });
  }
}
