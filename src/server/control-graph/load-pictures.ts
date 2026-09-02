import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { buildControlPicture, type ControlPicture } from "@/lib/control-picture";

export interface UCPicture {
  id: string;
  name: string;
  tier: number | null;
  picture: ControlPicture;
}

/** Build the per-use-case Control Picture for every use case in the org.
 *  Same source data as the estate Control Graph, but rendered as the plain-English
 *  verdict + four views (Touches · Can do · Could go wrong · Proof). */
export async function loadControlPictures(internalOrgId: string): Promise<UCPicture[]> {
  const sb = supabaseAdmin();

  const [{ data: ucs }, { data: stages }, { data: controls }, { data: conds }, { data: red }, { data: vrows }] = await Promise.all([
    sb.from("use_cases").select("id, name, tier, stack").eq("org_id", internalOrgId).neq("status", "archived").order("updated_at", { ascending: false }),
    sb.from("stage_records").select("use_case_id, stage, accepted_output")
      .eq("org_id", internalOrgId).in("stage", ["classify", "decision"]).not("accepted_at", "is", null)
      .order("created_at", { ascending: false }),
    sb.from("control_items").select("use_case_id, status, verification_status").eq("org_id", internalOrgId),
    sb.from("conditions").select("use_case_id, status").eq("org_id", internalOrgId),
    sb.from("red_team_findings").select("use_case_id, severity, unguarded_outcome, scenario").eq("org_id", internalOrgId),
    sb.from("vendor_reviews").select("product_name, decision, final_decision, self_attested").eq("org_id", internalOrgId).neq("status", "archived"),
  ]);

  const vendorStatus: Record<string, "reviewed" | "self"> = {};
  for (const v of vrows ?? []) {
    const k = String(v.product_name ?? "").toLowerCase().trim();
    if (!k) continue;
    if (v.final_decision || v.decision) vendorStatus[k] = "reviewed";
    else if (v.self_attested) vendorStatus[k] = "self";
  }

  const classifyByUc = new Map<string, { see?: string[]; decide?: string[]; do?: string[] }>();
  const decided = new Set<string>();
  for (const s of stages ?? []) {
    const uc = s.use_case_id as string | null;
    if (!uc) continue;
    if (s.stage === "decision") decided.add(uc);
    else if (s.stage === "classify" && !classifyByUc.has(uc)) classifyByUc.set(uc, (s.accepted_output as never) ?? {});
  }

  const ctrlByUc = new Map<string, { status: string; verification_status: string | null }[]>();
  for (const c of controls ?? []) {
    const uc = c.use_case_id as string | null;
    if (!uc) continue;
    const arr = ctrlByUc.get(uc) ?? [];
    arr.push({ status: c.status as string, verification_status: (c.verification_status as string | null) ?? null });
    ctrlByUc.set(uc, arr);
  }

  const openCond = new Map<string, number>();
  for (const c of conds ?? []) {
    if (c.status !== "open") continue;
    const uc = c.use_case_id as string;
    openCond.set(uc, (openCond.get(uc) ?? 0) + 1);
  }

  const redByUc = new Map<string, { severity: string; outcome: string }[]>();
  for (const r of red ?? []) {
    const uc = r.use_case_id as string | null;
    if (!uc) continue;
    const arr = redByUc.get(uc) ?? [];
    arr.push({ severity: String(r.severity ?? ""), outcome: String(r.unguarded_outcome ?? r.scenario ?? "") });
    redByUc.set(uc, arr);
  }

  return (ucs ?? []).map((u) => {
    const id = u.id as string;
    const stack = (u.stack as { products?: { category: string; name: string }[] } | null) ?? {};
    const picture = buildControlPicture({
      tier: (u.tier as number | null) ?? null,
      classify: classifyByUc.get(id) ?? null,
      products: (stack.products ?? []).map((p) => ({ category: p.category, name: p.name })),
      vendorStatus,
      controls: ctrlByUc.get(id) ?? [],
      redFindings: redByUc.get(id) ?? [],
      decided: decided.has(id),
      openConditions: openCond.get(id) ?? 0,
    });
    return { id, name: u.name as string, tier: (u.tier as number | null) ?? null, picture };
  });
}
