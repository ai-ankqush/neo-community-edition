import Link from "next/link";
import { getAuthContext } from "@/server/identity/auth-context";
import { supabaseAdmin } from "@/lib/supabase";
import { portfolioContext } from "@/lib/portfolio";
import { Card, KPICard, TierBadge, Th, Td } from "@/components/console/ui";
import TestStatusSelect from "@/components/console/test-status-select";
import UseCaseFilter from "@/components/console/use-case-filter";
import ControlsSubnav from "../controls/controls-subnav";
import { auth } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic"; // always reflect the latest test status + timestamp

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export default async function AssurancePage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string; uc?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await portfolioContext();
  if (!ctx) return <p className="text-[var(--muted)]">Select an organization first.</p>;
  const ucList = [...ctx.ucMap.entries()].map(([id, u]) => ({ id, name: u.name }));

  const { data: tests } = await supabaseAdmin()
    .from("assurance_tests")
    .select("id, use_case_id, objective, owner, result, run_at")
    .eq("org_id", ctx.internalOrgId)
    .order("created_at", { ascending: true });

  const all = tests ?? [];
  const passed = all.filter((t) => t.result === "passed").length;
  const failed = all.filter((t) => t.result === "failed").length;
  const inReview = all.filter((t) => t.result === "in_progress").length;
  const open = all.filter((t) => (t.result ?? "not_started") === "not_started").length;
  const rf = sp.r;
  const shown = (rf ? all.filter((t) => (t.result ?? "not_started") === rf) : all)
    .filter((t) => !sp.uc || t.use_case_id === sp.uc);
  const RESULT_LABEL: Record<string, string> = {
    not_started: "open", in_progress: "in review", passed: "passed", failed: "failed",
  };

  const { orgRole } = await getAuthContext();
  const canEdit = orgRole === "org:admin"; // assessors edit via API; rollup edit = admin for simplicity here

  return (
    <div className="flex flex-col gap-5">
      <ControlsSubnav />
      <div>
        <h2 className="text-xl font-bold">Assurance Tests</h2>
        <p className="mt-1 text-[13px] text-[var(--faint)]">
          Test plans across the portfolio - controls must be tested, observable, and defensible
        </p>
      </div>
      <div className="flex justify-end"><UseCaseFilter useCases={ucList} /></div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        <KPICard label="Total Tests" value={all.length} href="/dashboard/assurance" />
        <KPICard label="Open" value={open} color="var(--faint)" href="/dashboard/assurance?r=not_started" />
        <KPICard label="In Review" value={inReview} color="#3b82f6" href="/dashboard/assurance?r=in_progress" />
        <KPICard label="Passed" value={passed} color="#22c55e" href="/dashboard/assurance?r=passed" />
        <KPICard label="Failed" value={failed} color="#ef4444" href="/dashboard/assurance?r=failed" />
      </div>
      {rf && (
        <div className="-mt-2 text-[12px] text-[var(--muted)]">
          Showing {shown.length} {RESULT_LABEL[rf] ?? rf} · <Link href="/dashboard/assurance" className="text-[#3b82f6] hover:underline">clear filter</Link>
        </div>
      )}
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[560px] table-fixed text-[13px]">
          <colgroup>
            <col className="w-[24%]" />
            <col className="w-[38%]" />
            <col className="w-[14%]" />
            <col className="w-[12%]" />
            <col className="w-[12%]" />
          </colgroup>
          <thead className="bg-[var(--panel)]">
            <tr><Th>Use Case</Th><Th>Test Objective</Th><Th>Owner</Th><Th>Result</Th><Th>Tested</Th></tr>
          </thead>
          <tbody>
            {shown.map((t) => {
              const uc = ctx.ucMap.get(t.use_case_id);
              return (
                <tr key={t.id} className="align-top hover:bg-[var(--panel-hover)]">
                  <Td className="align-top">
                    <Link href={`/dashboard/use-cases/${t.use_case_id}?tab=tests`} className="break-words font-medium hover:underline">
                      {uc?.name ?? "—"}
                    </Link>{" "}
                    {uc?.tier && <TierBadge tier={uc.tier} />}
                  </Td>
                  <Td className="align-top leading-relaxed break-words">{t.objective}</Td>
                  <Td className="align-top break-words text-[var(--muted)]">{t.owner ?? "—"}</Td>
                  <Td className="align-top">
                    <TestStatusSelect testId={t.id} result={t.result} canEdit={canEdit} />
                  </Td>
                  <Td className="align-top whitespace-nowrap text-[12px] text-[var(--faint)]">
                    <span title={t.run_at ? new Date(t.run_at as string).toLocaleString() : "Not run yet"}>
                      {relTime((t.run_at as string | null) ?? null)}
                    </span>
                  </Td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr><Td className="py-10 text-center text-[var(--faint)]" colSpan={5}>
                {all.length === 0 ? "No assurance tests yet — complete the assurance stage on a use case." : "No tests match this filter."}
              </Td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
