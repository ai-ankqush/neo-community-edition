import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, ApiError } from "@/lib/rbac";
import { supabaseAdmin } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { slugify } from "@/server/frameworks/custom";

const Body = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(1000).optional(),
  authority: z.string().max(120).optional(),
});

/** Create a customer-owned framework the estate's controls can be mapped to.
 *  Governance act — defining a standard the whole org is measured against is admin-only. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole("org_admin");
    const b = Body.parse(await req.json());
    const sb = supabaseAdmin();

    let key = slugify(b.name);
    // ensure key is unique within the org
    const { data: clash } = await sb.from("org_frameworks").select("id").eq("org_id", session.internalOrgId).eq("key", key).maybeSingle();
    if (clash) key = `${key}_${Math.random().toString(36).slice(2, 6)}`;

    const { data, error } = await sb.from("org_frameworks").insert({
      org_id: session.internalOrgId, key, name: b.name, description: b.description ?? null,
      authority: b.authority ?? null, created_by: session.userId,
    }).select("id, key, name").single();
    if (error) throw new ApiError(500, error.message);

    await logAudit({ orgId: session.internalOrgId, actor: session.userId, action: "framework.create", objectType: "framework", objectId: data.id, detail: { name: b.name } });
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error("FRAMEWORK CREATE", err);
    return NextResponse.json({ error: "Could not create framework" }, { status: 500 });
  }
}
