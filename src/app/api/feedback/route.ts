import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/server/identity/auth-context";
import { supabaseAdmin } from "@/lib/supabase";

const Body = z.object({ message: z.string().min(3).max(4000), page: z.string().max(300).optional() });

/** POST /api/feedback - beta feedback from the Ask Neo "Feedback" tab. */
export async function POST(req: NextRequest) {
  try {
    const { userId, internalOrgId } = await getAuthContext();
    if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { message, page } = Body.parse(await req.json());
    await supabaseAdmin().from("feedback").insert({ org_id: internalOrgId, actor: userId, message, page: page ?? null });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error("FEEDBACK ERROR", err);
    return NextResponse.json({ error: "Could not submit feedback" }, { status: 500 });
  }
}
