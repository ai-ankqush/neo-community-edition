import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { getAuthContext } from "@/server/identity/auth-context";
import { costUSD, fmtUSD, PRICING_NOTE } from "@/lib/pricing";

export const metadata = { title: "FinOps · Admin · Neo" };
export const dynamic = "force-dynamic";

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

type Ev = { org_id: string; use_case_id: string | null; stage: string; model: string; input_tokens: number; output_tokens: number };

function bucket(stage: string): "red" | "build" | "assess" {
  if (stage === "red_team") return "red";
  if (stage === "artifacts") return "build";
  return "assess";
}

export default async function FinOpsPage() {
  const { orgRole } = await getAuthContext();
  if (!orgRole || !orgRole.includes("admin")) notFound();

  const sb = supabaseAdmin();
  const [{ data: events }, { data: ucs }, { data: orgs }] = await Promise.all([
    sb.from("usage_events").select("org_id, use_case_id, stage, model, input_tokens, output_tokens"),
    sb.from("use_cases").select("id, name, org_id, tier"),
    sb.from("organizations").select("id, name"),
  ]);

  const evs = (events ?? []) as Ev[];
  const ucName = new Map((ucs ?? []).map((u) => [u.id as string, u.name as string]));
  const ucTier = new Map((ucs ?? []).map((u) => [u.id as string, u.tier as number | null]));
  const ucOrg = new Map((ucs ?? []).map((u) => [u.id as string, u.org_id as string]));
  const orgName = new Map((orgs ?? []).map((o) => [o.id as string, o.name as string]));

  // per use case aggregation
  type Row = { ucId: string; name: string; org: string; tier: number | null; assess: number; build: number; red: number; tokens: number; total: number };
  const perUc = new Map<string, Row>();
  const perStage = new Map<string, { tokens: number; cost: number }>();
  let totalCost = 0, totalTokens = 0, redCost = 0, redTokens = 0, noUcCost = 0, noUcTokens = 0;
  const ucsWithRed = new Set<string>();

  for (const e of evs) {
    const tok = Number(e.input_tokens) + Number(e.output_tokens);
    const cost = costUSD(e.model, Number(e.input_tokens), Number(e.output_tokens));
    totalCost += cost; totalTokens += tok;

    const ps = perStage.get(e.stage) ?? { tokens: 0, cost: 0 };
    ps.tokens += tok; ps.cost += cost; perStage.set(e.stage, ps);

    if (e.stage === "red_team") { redCost += cost; redTokens += tok; if (e.use_case_id) ucsWithRed.add(e.use_case_id); }

    if (!e.use_case_id) { noUcCost += cost; noUcTokens += tok; continue; }
    const id = e.use_case_id;
    const row = perUc.get(id) ?? {
      ucId: id, name: ucName.get(id) ?? "(deleted use case)", org: orgName.get(ucOrg.get(id) ?? "") ?? "—",
      tier: ucTier.get(id) ?? null, assess: 0, build: 0, red: 0, tokens: 0, total: 0,
    };
    const b = bucket(e.stage);
    if (b === "red") row.red += cost; else if (b === "build") row.build += cost; else row.assess += cost;
    row.tokens += tok; row.total += cost;
    perUc.set(id, row);
  }

  const rows = [...perUc.values()].sort((a, b) => b.total - a.total);
  const ucCount = rows.length;
  const avgCost = ucCount ? totalCost / ucCount : 0;
  const avgTokens = ucCount ? totalTokens / ucCount : 0;
  const avgRed = ucsWithRed.size ? redCost / ucsWithRed.size : 0;
  const redShare = totalCost ? (redCost / totalCost) * 100 : 0;
  const stageRows = [...perStage.entries()].map(([stage, v]) => ({ stage, ...v })).sort((a, b) => b.cost - a.cost);

  const card = "rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3";
  const th = "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--faint)]";
  const td = "px-3 py-2 text-[13px] text-[var(--text)]";

  return (
    <div className="min-h-screen bg-[var(--bg)] px-6 py-8 text-[var(--text)]">
      <div className="mx-auto max-w-6xl">
        <div className="mb-1 flex items-center justify-between">
          <h1 className="text-xl font-bold">FinOps — token &amp; cost by use case</h1>
          <Link href="/admin" className="text-[13px] font-semibold text-[#3b82f6]">← Admin roster</Link>
        </div>
        <p className="mb-6 text-[12px] text-[var(--faint)]">{PRICING_NOTE} Per-use-case data is recorded from the FinOps release onward.</p>

        {evs.length === 0 ? (
          <div className={card}>No usage events recorded yet. Run an assessment, generate code, or run Red Team and they&apos;ll appear here.</div>
        ) : (
          <>
            <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
              <div className={card}><div className="text-[11px] uppercase tracking-wide text-[var(--faint)]">Total spend</div><div className="mt-1 text-2xl font-bold">{fmtUSD(totalCost)}</div></div>
              <div className={card}><div className="text-[11px] uppercase tracking-wide text-[var(--faint)]">Total tokens</div><div className="mt-1 text-2xl font-bold">{fmtTokens(totalTokens)}</div></div>
              <div className={card}><div className="text-[11px] uppercase tracking-wide text-[var(--faint)]">Use cases tracked</div><div className="mt-1 text-2xl font-bold">{ucCount}</div></div>
              <div className={card}><div className="text-[11px] uppercase tracking-wide text-[var(--faint)]">Avg / use case</div><div className="mt-1 text-2xl font-bold">{fmtUSD(avgCost)}</div><div className="text-[11px] text-[var(--faint)]">{fmtTokens(avgTokens)} tokens</div></div>
              <div className={card} style={{ borderColor: "#ef444459" }}><div className="text-[11px] uppercase tracking-wide text-[#ef4444]">Red Team spend</div><div className="mt-1 text-2xl font-bold">{fmtUSD(redCost)}</div><div className="text-[11px] text-[var(--faint)]">{redShare.toFixed(0)}% of total · {fmtUSD(avgRed)}/use case</div></div>
            </div>

            <h2 className="mb-2 text-[13px] font-semibold text-[var(--muted)]">By stage</h2>
            <div className="mb-7 overflow-hidden rounded-lg border border-[var(--border)]">
              <table className="w-full">
                <thead className="bg-[var(--surface)]"><tr><th className={th}>Stage</th><th className={th}>Tokens</th><th className={th}>Cost</th><th className={th}>% of spend</th></tr></thead>
                <tbody>
                  {stageRows.map((s) => (
                    <tr key={s.stage} className="border-t border-[var(--border)]">
                      <td className={td}>{s.stage === "red_team" ? <span className="font-semibold text-[#ef4444]">red_team</span> : s.stage}</td>
                      <td className={td}>{fmtTokens(s.tokens)}</td>
                      <td className={td}>{fmtUSD(s.cost)}</td>
                      <td className={td}>{totalCost ? ((s.cost / totalCost) * 100).toFixed(0) : 0}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h2 className="mb-2 text-[13px] font-semibold text-[var(--muted)]">By use case</h2>
            <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
              <table className="w-full">
                <thead className="bg-[var(--surface)]">
                  <tr><th className={th}>Use case</th><th className={th}>Org</th><th className={th}>Tier</th><th className={th}>Assessment</th><th className={th}>Build</th><th className={th}>Red Team</th><th className={th}>Tokens</th><th className={th}>Total</th></tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.ucId} className="border-t border-[var(--border)]">
                      <td className={td}>{r.name}</td>
                      <td className={`${td} text-[var(--muted)]`}>{r.org}</td>
                      <td className={td}>{r.tier ?? "—"}</td>
                      <td className={td}>{fmtUSD(r.assess)}</td>
                      <td className={td}>{fmtUSD(r.build)}</td>
                      <td className={`${td} ${r.red > 0 ? "text-[#ef4444]" : "text-[var(--faint)]"}`}>{fmtUSD(r.red)}</td>
                      <td className={`${td} text-[var(--muted)]`}>{fmtTokens(r.tokens)}</td>
                      <td className={`${td} font-semibold`}>{fmtUSD(r.total)}</td>
                    </tr>
                  ))}
                  {noUcCost > 0 && (
                    <tr className="border-t border-[var(--border)] bg-[var(--surface)]">
                      <td className={`${td} italic text-[var(--muted)]`}>Portfolio / Ask Neo (no use case)</td>
                      <td className={td}>—</td><td className={td}>—</td><td className={td}>—</td><td className={td}>—</td><td className={td}>—</td>
                      <td className={`${td} text-[var(--muted)]`}>{fmtTokens(noUcTokens)}</td>
                      <td className={`${td} font-semibold`}>{fmtUSD(noUcCost)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
