import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { portfolioContext } from "@/lib/portfolio";
import { Card, TierBadge, RecBadge, StatusDot, Th, Td } from "@/components/console/ui";
import { STAGE_LABELS } from "@/lib/types/stages";
import type { Stage } from "@/lib/types/stages";
import UseCaseFilter from "@/components/console/use-case-filter";

export default async function DecisionPage({ searchParams }: { searchParams: Promise<{ uc?: string }> }) {
  const sp = await searchParams;
  const ctx = await portfolioContext();
  if (!ctx) return <p className="text-[var(--muted)]">Select an organization first.</p>;
  const sb = supabaseAdmin();
  const ucList = ctx.useCases.map((u) => ({ id: u.id, name: u.name }));
  const shownUcs = ctx.useCases.filter((u) => !sp.uc || u.id === sp.uc);

  const [{ data: approvals }, { data: conditions }] = await Promise.all([
    sb.from("approvals")
      .select("use_case_id, decision, created_at")
      .eq("org_id", ctx.internalOrgId)
      .order("created_at", { ascending: false }),
    sb.from("conditions")
      .select("use_case_id, status")
      .eq("org_id", ctx.internalOrgId),
  ]);

  const latest = new Map<string, string>();
  for (const a of approvals ?? []) {
    if (!latest.has(a.use_case_id)) latest.set(a.use_case_id, a.decision);
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-bold">Decision Readiness</h2>
        <p className="mt-1 text-[13px] text-[var(--faint)]">
          Approval posture per use case - decisions, open conditions, and what is still in assessment
        </p>
      </div>
      <div className="flex justify-end"><UseCaseFilter useCases={ucList} /></div>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead className="bg-[var(--panel)]">
            <tr><Th>Use Case</Th><Th>Tier</Th><Th>Stage</Th><Th>Decision</Th><Th>Open Conditions</Th></tr>
          </thead>
          <tbody>
            {shownUcs.map((uc) => {
              const open = (conditions ?? []).filter(
                (c) => c.use_case_id === uc.id && c.status === "open"
              ).length;
              return (
                <tr key={uc.id} className="hover:bg-[var(--panel-hover)]">
                  <Td className="whitespace-nowrap font-medium">
                    <Link href={`/dashboard/use-cases/${uc.id}?tab=decision`} className="hover:underline">
                      {uc.name}
                    </Link>
                  </Td>
                  <Td>{uc.tier ? <TierBadge tier={uc.tier} /> : <span className="text-[#4b5563]">—</span>}</Td>
                  <Td className="whitespace-nowrap text-[var(--muted)]">{STAGE_LABELS[uc.stage as Stage] ?? uc.stage}</Td>
                  <Td>
                    {latest.has(uc.id) ? (
                      <RecBadge rec={latest.get(uc.id)!} />
                    ) : (
                      <span className="text-[var(--faint)]">In assessment</span>
                    )}
                  </Td>
                  <Td>
                    {open > 0 ? (
                      <StatusDot status="open" />
                    ) : latest.has(uc.id) ? (
                      <StatusDot status="closed" />
                    ) : (
                      <span className="text-[#4b5563]">—</span>
                    )}{" "}
                    {open > 0 && <span className="text-xs text-[var(--muted)]">{open} open</span>}
                  </Td>
                </tr>
              );
            })}
            {shownUcs.length === 0 && (
              <tr><Td className="py-10 text-center text-[var(--faint)]" colSpan={5}>No use cases yet.</Td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
