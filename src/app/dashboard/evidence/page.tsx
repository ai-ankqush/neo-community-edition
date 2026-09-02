import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { portfolioContext } from "@/lib/portfolio";
import { planFor } from "@/lib/plans";
import { Card, KPICard, TierBadge, StatusDot, Th, Td } from "@/components/console/ui";
import { PILLAR_NAMES } from "@/components/console/theme";
import UseCaseFilter from "@/components/console/use-case-filter";
import ControlsSubnav from "../controls/controls-subnav";

const VERIFY_META: Record<string, { label: string; color: string; icon: string }> = {
  verified: { label: "Verified", color: "#22c55e", icon: "✓" },
  partial: { label: "Partial", color: "#f59e0b", icon: "◐" },
  missing: { label: "Missing", color: "#ef4444", icon: "✗" },
  not_checked: { label: "Not checked", color: "var(--faint)", icon: "○" },
};

export default async function EvidencePage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string; s?: string; uc?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await portfolioContext();
  if (!ctx) return <p className="text-[var(--muted)]">Select an organization first.</p>;
  const sb = supabaseAdmin();
  const ucList = [...ctx.ucMap.entries()].map(([id, u]) => ({ id, name: u.name }));
  const ucFilter = sp.uc;

  const { data: orgRow } = await sb
    .from("organizations").select("plan").eq("id", ctx.internalOrgId).single();
  const plan = planFor(orgRow?.plan);

  // Premium+: evidence is validated against controls (does it exist, what is it)
  if (plan.verificationManual) {
    const [{ data: controls }, { data: liveEv }] = await Promise.all([
      sb.from("control_items")
        .select("id, use_case_id, pillar, control, evidence, verification_status, verification_note, verification_mode, evidence_url")
        .eq("org_id", ctx.internalOrgId)
        .order("pillar", { ascending: true }),
      sb.from("control_evidence")
        .select("control_id, result, raw_artifact_ref, provider, checked_at")
        .eq("org_id", ctx.internalOrgId).not("control_id", "is", null)
        .order("checked_at", { ascending: false }),
    ]);
    // latest live evidence per control
    const liveByCtrl = new Map<string, { result: string; ref: string | null; provider: string | null; at: string | null }>();
    for (const e of liveEv ?? []) {
      const cid = e.control_id as string;
      if (cid && !liveByCtrl.has(cid)) liveByCtrl.set(cid, { result: e.result as string, ref: e.raw_artifact_ref as string | null, provider: e.provider as string | null, at: e.checked_at as string | null });
    }
    const LIVE_COLOR: Record<string, string> = { pass: "#22c55e", fail: "#ef4444", partial: "#f59e0b", error: "#8892a4" };

    const all = controls ?? [];
    const counts = {
      verified: all.filter((c) => c.verification_status === "verified").length,
      partial: all.filter((c) => c.verification_status === "partial").length,
      missing: all.filter((c) => c.verification_status === "missing").length,
      pending: all.filter((c) => (c.verification_status ?? "not_checked") === "not_checked").length,
    };
    const vf = sp.v;
    const shown = (vf ? all.filter((c) => (c.verification_status ?? "not_checked") === vf) : all)
      .filter((c) => !ucFilter || c.use_case_id === ucFilter);

    return (
      <div className="flex flex-col gap-5">
        <ControlsSubnav />
        <div>
          <h2 className="text-xl font-bold">Evidence & Validation</h2>
          <p className="mt-1 text-[13px] text-[var(--faint)]">
            Evidence validated against each control - does it exist, partially exist, or is it missing.
            {" Verify each control in its use case — live connector checks where an integration is connected, manual attestation for the rest."}
          </p>
        </div>
        <div className="flex justify-end"><UseCaseFilter useCases={ucList} /></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
          <KPICard label="Evidence Verified" value={counts.verified} color="#22c55e" href="/dashboard/evidence?v=verified" />
          <KPICard label="Partial" value={counts.partial} color="#f59e0b" href="/dashboard/evidence?v=partial" />
          <KPICard label="Missing" value={counts.missing} color="#ef4444" href="/dashboard/evidence?v=missing" />
          <KPICard label="Not Yet Checked" value={counts.pending} color="var(--faint)" href="/dashboard/evidence?v=not_checked" />
        </div>
        {vf && (
          <div className="-mt-2 text-[12px] text-[var(--muted)]">
            Showing {shown.length} {vf.replace("_", " ")} · <Link href="/dashboard/evidence" className="text-[#3b82f6] hover:underline">clear filter</Link>
          </div>
        )}
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead className="bg-[var(--panel)]">
              <tr>
                <Th>Use Case</Th><Th>Control</Th><Th>Required Evidence</Th>
                <Th>Status</Th><Th>Live check</Th><Th>What Exists</Th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => {
                const uc = ctx.ucMap.get(c.use_case_id);
                const v = VERIFY_META[c.verification_status ?? "not_checked"];
                return (
                  <tr key={c.id} className="border-t border-[var(--surface-2)] align-top hover:bg-[var(--panel-hover)]">
                    <Td className="whitespace-nowrap">
                      <Link href={`/dashboard/use-cases/${c.use_case_id}?tab=evidence`} className="hover:underline">
                        {uc?.name ?? "—"}
                      </Link>{" "}
                      {uc?.tier && <TierBadge tier={uc.tier} />}
                    </Td>
                    <Td>
                      <span className="font-medium text-[var(--text)]">{c.control}</span>
                      <span className="ml-1 text-[11px] text-[var(--faint)]">· {PILLAR_NAMES[c.pillar]}</span>
                    </Td>
                    <Td className="text-[var(--muted)]">{c.evidence ?? "—"}</Td>
                    <Td className="whitespace-nowrap">
                      <span className="rounded px-2 py-0.5 text-[11px] font-bold"
                        style={{ color: v.color, background: `${v.color}1a`, border: `1px solid ${v.color}35` }}>
                        {v.icon} {v.label}
                      </span>
                    </Td>
                    <Td className="whitespace-nowrap">
                      {(() => {
                        const le = liveByCtrl.get(c.id);
                        if (!le) return <span className="text-[#4b5563]">—</span>;
                        const col = LIVE_COLOR[le.result] ?? "#8892a4";
                        return (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="rounded px-1.5 py-0.5 text-[10.5px] font-bold" style={{ color: col, background: `${col}1a` }}>{le.result.toUpperCase()}</span>
                            {le.provider && <span className="text-[10.5px] text-[var(--faint)]">{le.provider}</span>}
                            {le.ref && <a href={le.ref} target="_blank" rel="noopener noreferrer" className="text-[10.5px] text-[#3b82f6] underline">↗</a>}
                          </span>
                        );
                      })()}
                    </Td>
                    <Td className="text-[var(--muted)]">
                      {c.verification_note ?? (c.evidence_url ? null : <span className="text-[#4b5563]">—</span>)}
                      {c.evidence_url && (
                        <a href={c.evidence_url} target="_blank" rel="noopener noreferrer" className="ml-1 text-[11px] text-[#3b82f6] underline">attached ↗</a>
                      )}
                    </Td>
                  </tr>
                );
              })}
              {shown.length === 0 && (
                <tr><Td className="py-10 text-center text-[var(--faint)]" colSpan={5}>
                  {all.length === 0
                    ? "No controls yet — complete the controls stage on a use case, then verify each control."
                    : "No controls match this filter."}
                </Td></tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
    );
  }

  // Free/Starter: evidence request list (collect manually, no validation)
  const { data: items } = await sb
    .from("evidence_items")
    .select("id, use_case_id, title, status, created_at")
    .eq("org_id", ctx.internalOrgId)
    .order("created_at", { ascending: true });

  const all = items ?? [];
  const provided = all.filter((i) => i.status === "provided").length;
  const sf = sp.s;
  const shownItems = (sf === "provided" ? all.filter((i) => i.status === "provided")
    : sf === "outstanding" ? all.filter((i) => i.status !== "provided") : all)
    .filter((i) => !ucFilter || i.use_case_id === ucFilter);

  return (
    <div className="flex flex-col gap-5">
      <ControlsSubnav />
      <div>
        <h2 className="text-xl font-bold">Evidence Requests</h2>
        <p className="mt-1 text-[13px] text-[var(--faint)]">
          The evidence each control needs. Upgrade to Premium to validate evidence against
          controls - confirm what exists, partially exists, or is missing.
        </p>
      </div>
      <div className="flex justify-end"><UseCaseFilter useCases={ucList} /></div>
      <div className="grid grid-cols-3 gap-3.5">
        <KPICard label="Evidence Items" value={all.length} href="/dashboard/evidence" />
        <KPICard label="Provided" value={provided} color="#22c55e" href="/dashboard/evidence?s=provided" />
        <KPICard label="Outstanding" value={all.length - provided} color="#f59e0b" href="/dashboard/evidence?s=outstanding" />
      </div>
      {sf && (
        <div className="-mt-2 text-[12px] text-[var(--muted)]">
          Showing {shownItems.length} {sf} · <Link href="/dashboard/evidence" className="text-[#3b82f6] hover:underline">clear filter</Link>
        </div>
      )}
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead className="bg-[var(--panel)]">
            <tr><Th>Use Case</Th><Th>Evidence Item</Th><Th>Status</Th></tr>
          </thead>
          <tbody>
            {shownItems.map((i) => {
              const uc = ctx.ucMap.get(i.use_case_id);
              return (
                <tr key={i.id} className="border-t border-[var(--surface-2)] hover:bg-[var(--panel-hover)]">
                  <Td className="whitespace-nowrap">
                    <Link href={`/dashboard/use-cases/${i.use_case_id}?tab=evidence`} className="hover:underline">
                      {uc?.name ?? "—"}
                    </Link>{" "}
                    {uc?.tier && <TierBadge tier={uc.tier} />}
                  </Td>
                  <Td>{i.title}</Td>
                  <Td className="whitespace-nowrap"><StatusDot status={i.status} /></Td>
                </tr>
              );
            })}
            {shownItems.length === 0 && (
              <tr><Td className="py-10 text-center text-[var(--faint)]" colSpan={3}>
                {all.length === 0 ? "No evidence requests yet — complete the evidence stage on a use case." : "No items match this filter."}
              </Td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
