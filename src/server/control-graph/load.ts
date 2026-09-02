import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { buildControlGraph, type ControlGraph, type CGInputUseCase } from "@/lib/control-graph";

/** Derive the AI Control Graph for an org from existing assessment data:
 *  use cases + their classification (see/decide/do) + declared stack + control
 *  state + whether a decision was recorded. No new tables. */
export async function loadControlGraph(internalOrgId: string): Promise<ControlGraph> {
  const sb = supabaseAdmin();

  const [{ data: ucs }, { data: stages }, { data: controls }, { data: exc }, { data: inc }, { data: vrows }] = await Promise.all([
    sb.from("use_cases").select("id, name, tier, stage, stack, technical_owner, sponsor, lifecycle").eq("org_id", internalOrgId).neq("status", "archived"),
    sb.from("stage_records").select("use_case_id, stage, accepted_output, accepted_at")
      .eq("org_id", internalOrgId).in("stage", ["classify", "decision"]).not("accepted_at", "is", null)
      .order("created_at", { ascending: false }),
    sb.from("control_items").select("use_case_id, status, verification_status").eq("org_id", internalOrgId),
    sb.from("use_case_exceptions").select("use_case_id").eq("org_id", internalOrgId).eq("status", "open"),
    sb.from("use_case_incidents").select("use_case_id").eq("org_id", internalOrgId).neq("status", "resolved"),
    sb.from("vendor_reviews").select("product_name, decision, final_decision, self_attested").eq("org_id", internalOrgId).neq("status", "archived"),
  ]);

  // vendor risk status by product name (matches the stack-picker convention)
  const vendorStatus = new Map<string, "reviewed" | "self">();
  for (const v of vrows ?? []) {
    const key = String(v.product_name ?? "").toLowerCase().trim();
    if (!key) continue;
    if (v.final_decision || v.decision) vendorStatus.set(key, "reviewed");
    else if (v.self_attested) vendorStatus.set(key, "self");
  }
  const AI_CATS = new Set(["ai_platform", "agent_framework", "identified"]);

  const excCount = new Map<string, number>();
  for (const e of exc ?? []) { const id = e.use_case_id as string; excCount.set(id, (excCount.get(id) ?? 0) + 1); }
  const incCount = new Map<string, number>();
  for (const i of inc ?? []) { const id = i.use_case_id as string; incCount.set(id, (incCount.get(id) ?? 0) + 1); }

  // latest accepted classify per use case + the set of use cases with a decision
  const classifyByUc = new Map<string, { see?: string[]; decide?: string[]; do?: string[] }>();
  const decided = new Set<string>();
  for (const s of stages ?? []) {
    const uc = s.use_case_id as string | null;
    if (!uc) continue;
    if (s.stage === "decision") decided.add(uc);
    else if (s.stage === "classify" && !classifyByUc.has(uc)) {
      classifyByUc.set(uc, (s.accepted_output as never) ?? {});
    }
  }

  // control counts per use case
  const ctrl = new Map<string, { req: number; impl: number; evid: boolean }>();
  for (const c of controls ?? []) {
    const uc = c.use_case_id as string | null;
    if (!uc) continue;
    const e = ctrl.get(uc) ?? { req: 0, impl: 0, evid: false };
    e.req += 1;
    if (c.status === "in_place") e.impl += 1;
    if (c.verification_status === "verified") e.evid = true;
    ctrl.set(uc, e);
  }

  const rows: CGInputUseCase[] = (ucs ?? []).map((u) => {
    const id = u.id as string;
    const cl = classifyByUc.get(id) ?? {};
    const stack = (u.stack as { products?: { category: string; name: string }[] } | null) ?? {};
    const c = ctrl.get(id) ?? { req: 0, impl: 0, evid: false };
    const vendors = (stack.products ?? [])
      .filter((p) => AI_CATS.has(p.category))
      .map((p) => ({ name: p.name, status: vendorStatus.get((p.name ?? "").toLowerCase().trim()) ?? ("unassessed" as const) }));
    return {
      id, name: u.name as string, tier: (u.tier as number | null) ?? null, stage: (u.stage as string | null) ?? null,
      lifecycle: (u.lifecycle as string | null) ?? null,
      technicalOwner: (u.technical_owner as string | null) ?? null,
      sponsor: (u.sponsor as string | null) ?? null,
      sees: cl.see ?? [], does: cl.do ?? [],
      products: stack.products ?? [],
      controlsRequired: c.req, controlsImplemented: c.impl, hasEvidence: c.evid,
      decided: decided.has(id),
      openExceptions: excCount.get(id) ?? 0, openIncidents: incCount.get(id) ?? 0,
      vendors,
    };
  });

  return buildControlGraph(rows);
}
