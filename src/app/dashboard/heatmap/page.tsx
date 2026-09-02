import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { portfolioContext } from "@/lib/portfolio";
import { Card, TierBadge } from "@/components/console/ui";

/**
 * Risk Heatmap - use cases x risk driver areas, rated L/M/H/C.
 * Matches the Layer 1 console design: ratings come from each use case's
 * accepted tier-stage risk drivers.
 */
const AREAS = [
  "Data Boundary", "Decision Influence", "Tool/Action", "Human Accountability",
  "Evidence", "Containment", "Vendor/Supply Chain", "Regulatory",
  "External Exposure", "Recoverability",
];

const RATING_COLOR: Record<string, string> = {
  Critical: "#ef4444", High: "#f97316", Medium: "#f59e0b", Low: "#22c55e",
};

interface RiskDriver { area: string; rating: string; reason?: string }

export default async function HeatmapPage() {
  const ctx = await portfolioContext();
  if (!ctx) return <p className="text-[var(--muted)]">Select an organization first.</p>;

  // accepted tier-stage outputs carry the risk drivers
  const { data: tierRecords } = await supabaseAdmin()
    .from("stage_records")
    .select("use_case_id, accepted_output, created_at")
    .eq("org_id", ctx.internalOrgId)
    .eq("stage", "tier")
    .not("accepted_at", "is", null)
    .order("created_at", { ascending: true });

  const driversByUC = new Map<string, RiskDriver[]>();
  for (const r of tierRecords ?? []) {
    const out = r.accepted_output as { riskDrivers?: unknown[] } | null;
    const drivers = (out?.riskDrivers ?? []).filter(
      (d): d is RiskDriver => typeof d === "object" && d !== null && "area" in (d as object)
    );
    if (drivers.length) driversByUC.set(r.use_case_id, drivers); // latest wins
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold">Risk Heatmap</h2>
        <p className="mt-1 text-[13px] text-[var(--faint)]">
          Risk driver ratings per use case, from the accepted tier assessment
        </p>
      </div>
      <Card dataTour="risk-heatmap" className="overflow-auto p-0">
        <table className="w-full border-collapse text-[11px]" style={{ minWidth: 900 }}>
          <thead>
            <tr className="bg-[var(--panel)]">
              <th className="sticky left-0 z-10 border-b border-[var(--border)] bg-[var(--panel)] px-3 py-2.5 text-left font-medium text-[var(--faint)]">
                Use Case
              </th>
              {AREAS.map((a) => (
                <th key={a} className="border-b border-[var(--border)] px-1.5 py-2.5 text-center text-[10px] font-medium text-[var(--faint)]">
                  {a}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ctx.useCases.map((uc) => {
              const drivers = driversByUC.get(uc.id) ?? [];
              return (
                <tr key={uc.id} className="border-b border-[var(--surface-2)] hover:bg-[var(--panel-hover)]">
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-[var(--surface)] px-3 py-2.5 text-xs font-medium">
                    {uc.tier && <span className="mr-2"><TierBadge tier={uc.tier} /></span>}
                    <Link href={`/dashboard/use-cases/${uc.id}`} className="hover:underline">
                      {uc.name}
                    </Link>
                  </td>
                  {AREAS.map((a) => {
                    const d = drivers.find((x) => x.area === a);
                    return (
                      <td key={a} className="px-1.5 py-2 text-center">
                        {d ? (
                          <span
                            title={`${a}: ${d.rating}${d.reason ? ` - ${d.reason}` : ""}`}
                            className="inline-block h-7 w-7 rounded text-center text-[9px] font-bold leading-7"
                            style={{
                              background: `${RATING_COLOR[d.rating] ?? "var(--faint)"}20`,
                              color: RATING_COLOR[d.rating] ?? "var(--faint)",
                            }}
                          >
                            {d.rating.charAt(0)}
                          </span>
                        ) : (
                          <span className="text-[var(--border-strong)]">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {ctx.useCases.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-10 text-center text-[var(--faint)]">
                  No use cases yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="flex items-center gap-4 border-t border-[var(--border)] px-4 py-2.5 text-[11px] text-[var(--faint)]">
          {Object.entries(RATING_COLOR).map(([label, color]) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className="inline-block h-3.5 w-3.5 rounded text-center text-[8px] font-bold leading-[14px]"
                style={{ background: `${color}20`, color }}>
                {label.charAt(0)}
              </span>
              {label}
            </span>
          ))}
          <span className="text-[#4b5563]">— : not yet rated — run or re-run the Tier assessment to populate it</span>
        </div>
      </Card>
    </div>
  );
}
