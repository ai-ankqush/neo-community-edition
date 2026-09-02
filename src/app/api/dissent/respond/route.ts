import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, ApiError } from "@/lib/rbac";
import { supabaseAdmin } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";

/**
 * POST /api/dissent/respond — the human answers Neo's disagreement.
 *
 * Two ways to answer:
 *   accept  — you agree; the dissent closes and Neo was right.
 *   overrule — you disagree; Neo steps aside. A REASON IS REQUIRED. That is the whole point:
 *              Neo never blocks, but the override and its justification go on the record.
 *              "The AI flagged this, a named human overruled it, and here is why" is the
 *              artifact a regulator, a board, or a post-incident review will ask for.
 *
 * Overruling does NOT mark Neo wrong — that is settled later by what actually happens
 * (the evidence going away = Neo was wrong; an incident = Neo was right). The calibration
 * scorecard reads `resolution`, so the record has to stay honest about who was right.
 */

const Body = z.object({
  id: z.string().uuid(),
  action: z.enum(["accept", "overrule"]),
  reason: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole("org_admin"); // accountable human only — this is a governance override
    const b = Body.parse(await req.json());
    const sb = supabaseAdmin();

    if (b.action === "overrule") {
      const reason = (b.reason ?? "").trim();
      if (reason.length < 10) {
        throw new ApiError(400, "A reason is required to overrule. Neo will step aside — but the record needs to say why.");
      }
    }

    const { data: d } = await sb.from("dissents")
      .select("id, rule, claim, status, use_case_id")
      .eq("org_id", session.internalOrgId).eq("id", b.id).maybeSingle();
    if (!d) throw new ApiError(404, "Dissent not found");
    if (d.status !== "open") throw new ApiError(409, "This disagreement has already been answered.");

    const now = new Date().toISOString();
    const { error } = await sb.from("dissents").update({
      status: b.action === "accept" ? "accepted" : "overruled",
      human_reason: b.action === "overrule" ? (b.reason ?? "").trim() : (b.reason ?? "").trim() || null,
      responded_by: session.userId,
      responded_at: now,
      // Accepting settles it: the human agreed with the claim. Overruling leaves the verdict open —
      // reality decides that one, and the scorecard waits for it.
      ...(b.action === "accept" ? { resolution: "neo_right", resolved_at: now } : {}),
    }).eq("org_id", session.internalOrgId).eq("id", b.id);
    if (error) throw new ApiError(500, error.message);

    await logAudit({
      orgId: session.internalOrgId,
      actor: session.userId,
      action: b.action === "accept" ? "dissent.accepted" : "dissent.overruled",
      objectType: "dissent",
      objectId: b.id,
      detail: { rule: d.rule, claim: d.claim, use_case_id: d.use_case_id, reason: b.reason ?? null },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error("DISSENT RESPOND ERROR", err);
    return NextResponse.json({ error: "Could not record your response" }, { status: 500 });
  }
}
