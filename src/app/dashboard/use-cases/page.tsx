import Link from "next/link";
import { getAuthContext } from "@/server/identity/auth-context";
import { supabaseAdmin } from "@/lib/supabase";
import { planFor } from "@/lib/plans";
import UseCasesTable, { type UCRow } from "./use-cases-table";

export default async function UseCasesPage() {
  const { orgRole, internalOrgId } = await getAuthContext();
  if (!internalOrgId) return <p className="text-[var(--muted)]">Select an organization first.</p>;
  const sb = supabaseAdmin();

  const [{ data: useCases }, { data: approvals }, { data: org }, { data: slots }] = await Promise.all([
    sb.from("use_cases")
      .select("id, name, stage, tier, patterns, business_function, updated_at")
      .eq("org_id", internalOrgId).neq("status", "archived")
      .order("updated_at", { ascending: false }),
    sb.from("approvals")
      .select("use_case_id, decision, created_at")
      .eq("org_id", internalOrgId)
      .order("created_at", { ascending: false }),
    sb.from("organizations").select("plan").eq("id", internalOrgId).single(),
    sb.from("slot_consumptions").select("use_case_id").eq("org_id", internalOrgId),
  ]);
  const unlimited = !Number.isFinite(planFor(org?.plan).useCasesActive);
  const consumedIds = [...new Set((slots ?? []).map((s) => s.use_case_id as string))];
  const isAdmin = orgRole === "org:admin";

  const latestRec = new Map<string, string>();
  for (const a of approvals ?? []) {
    if (!latestRec.has(a.use_case_id)) latestRec.set(a.use_case_id, a.decision);
  }

  const rows: UCRow[] = (useCases ?? []).map((uc) => ({
    id: uc.id,
    name: uc.name,
    stage: uc.stage,
    tier: uc.tier,
    patterns: uc.patterns,
    business_function: uc.business_function,
    decision: latestRec.get(uc.id) ?? null,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">AI Use Case Portfolio</h1>
        <Link
          data-tour="new-use-case"
          href="/dashboard/use-cases/new"
          className="rounded-md bg-[#3b82f6] px-4 py-2 text-[13px] font-semibold text-white"
        >
          New use case
        </Link>
      </div>

      <UseCasesTable rows={rows} isAdmin={isAdmin} unlimited={unlimited} consumedIds={consumedIds} />
    </div>
  );
}
