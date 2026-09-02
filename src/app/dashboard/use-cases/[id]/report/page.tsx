import Link from "next/link";
import { getAuthContext } from "@/server/identity/auth-context";
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { ensureOrg } from "@/lib/org";
import { supabaseAdmin } from "@/lib/supabase";
import { planFor } from "@/lib/plans";
import { PILLAR_NAMES } from "@/components/console/theme";
import { TIER_NAMES, REC_DISPLAY } from "@/components/console/theme";
import PrintButton from "./print-button";
import { BRAND } from "@/lib/brand";

const VERDICTS: Record<string, string> = {
  approved: "Approved",
  approved_with_conditions: "Approved with conditions",
  pilot_only_strict_controls: "Pilot only — strict controls",
  rejected_pending_technology: "Rejected — pending technology",
  rejected: "Rejected",
};
const VERIFY: Record<string, string> = {
  verified: "Verified", partial: "Partial", missing: "Missing", not_checked: "Not checked",
};

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await getAuthContext();
  if (!orgId) return <p className="p-8 text-slate-600">Select an organization first.</p>;
  const internalOrgId = (await getAuthContext()).internalOrgId as string;
  const sb = supabaseAdmin();

  const [{ data: uc }, { data: org }] = await Promise.all([
    sb.from("use_cases").select("*").eq("org_id", internalOrgId).eq("id", id).maybeSingle(),
    sb.from("organizations").select("name, plan").eq("id", internalOrgId).single(),
  ]);
  if (!uc) notFound();
  const plan = planFor(org?.plan);

  const [
    { data: stageRecords }, { data: controls }, { data: evidence },
    { data: tests }, { data: conditions }, { data: approval }, { data: board },
  ] = await Promise.all([
    sb.from("stage_records").select("stage, accepted_output").eq("org_id", internalOrgId).eq("use_case_id", id).not("accepted_at", "is", null).order("created_at"),
    sb.from("control_items").select("*").eq("org_id", internalOrgId).eq("use_case_id", id).order("pillar"),
    sb.from("evidence_items").select("title, status").eq("org_id", internalOrgId).eq("use_case_id", id),
    sb.from("assurance_tests").select("objective, result, owner").eq("org_id", internalOrgId).eq("use_case_id", id),
    sb.from("conditions").select("text, owner, consequence, status").eq("org_id", internalOrgId).eq("use_case_id", id),
    sb.from("approvals").select("decision, rationale").eq("org_id", internalOrgId).eq("use_case_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("board_decisions").select("verdict, rationale, created_at").eq("org_id", internalOrgId).eq("use_case_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const accepted = (s: string) => (stageRecords ?? []).filter((r) => r.stage === s).pop()?.accepted_output as Record<string, unknown> | undefined;
  const classify = accepted("classify");
  const tier = accepted("tier");
  const stack = (uc.stack as { products?: { name: string; services?: string[] }[] } | null)?.products ?? [];
  const cs = controls ?? [];
  const fwLabel = plan.allCrosswalks;

  return (
    <div className="report mx-auto max-w-4xl bg-white p-10 text-slate-800 print:p-0">
      <style>{`
        @media print {
          body { background: white !important; }
          aside, header, .print\\:hidden { display: none !important; }
          .report { max-width: 100% !important; color: #1e293b !important; }
        }
        .report h2 { color:#0A1628; font-weight:700; }
      `}</style>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[#0891B2]">{BRAND.name} · AI Control Architecture</p>
          <h1 className="mt-1 text-2xl font-bold text-[#0A1628]">AI Control Assessment Report</h1>
          <p className="mt-1 text-sm text-slate-500">{org?.name} · Generated {new Date().toLocaleDateString()}</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/dashboard/use-cases/${id}`} className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-600 print:hidden">← Back</Link>
          <PrintButton />
        </div>
      </div>

      {/* header block */}
      <div className="mb-6 rounded-lg border border-slate-200 p-5">
        <div className="flex items-center gap-3">
          <h2 className="text-xl">{uc.name}</h2>
          {uc.tier ? <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">Tier {uc.tier} · {TIER_NAMES[uc.tier]}</span> : null}
        </div>
        <p className="mt-2 text-sm text-slate-600">{(uc.patterns ?? []).join(" / ")}</p>
        {tier?.punchline ? <p className="mt-3 border-l-2 border-[#0891B2] pl-3 text-sm italic text-slate-700">{String(tier.punchline)}</p> : null}
      </div>

      {/* 1. Executive summary */}
      <Section n="1" title="Executive Summary">
        <p className="text-sm leading-relaxed">{String(tier?.rationale ?? uc.description ?? "—")}</p>
        {approval ? (
          <p className="mt-3 text-sm"><b>Engine recommendation:</b> {REC_DISPLAY[approval.decision]?.label ?? approval.decision}</p>
        ) : null}
        {board ? (
          <p className="mt-1 text-sm"><b>Review board decision:</b> {VERDICTS[board.verdict] ?? board.verdict} — <span className="text-slate-600">{board.rationale}</span></p>
        ) : null}
      </Section>

      {/* 2. Authority */}
      <Section n="2" title="Authority Model (See / Decide / Do)">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <Col label="SEE" items={(classify?.see as string[]) ?? []} />
          <Col label="DECIDE" items={(classify?.decide as string[]) ?? []} />
          <Col label="DO" items={(classify?.do as string[]) ?? []} />
        </div>
        <p className="mt-3 text-sm"><b>Autonomy:</b> Level {String(classify?.autonomyLevel ?? "—")} / 5</p>
      </Section>

      {/* 3. Tech stack */}
      {stack.length > 0 && (
        <Section n="3" title="Technology Stack">
          <div className="flex flex-wrap gap-1.5">
            {stack.map((p, i) => (
              <span key={i} className="rounded border border-slate-300 px-2 py-0.5 text-xs">
                {p.name}{p.services && p.services.length > 0 ? `: ${p.services.join(", ")}` : ""}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* 4. Controls + verification */}
      <Section n="4" title={`Control Map (${cs.length})`}>
        <table className="w-full text-xs">
          <thead><tr className="border-b border-slate-300 text-left text-slate-500">
            <th className="py-1.5">Pillar</th><th>Control</th><th>Implement (your stack)</th>
            <th>{fwLabel ? "EU AI Act" : "NIST"}</th><th>Verification</th>
          </tr></thead>
          <tbody>
            {cs.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 align-top">
                <td className="py-1.5 pr-2 text-slate-500">{PILLAR_NAMES[c.pillar]}</td>
                <td className="pr-2 font-medium">{c.control}</td>
                <td className="pr-2 text-slate-600">{c.stack_implementation ?? "—"}</td>
                <td className="pr-2 font-mono text-[10px] text-slate-500">
                  {(c.framework_refs as Record<string,string>)?.[fwLabel ? "eu_ai_act" : "nist_ai_rmf"] ?? "—"}
                </td>
                <td className="whitespace-nowrap">{VERIFY[c.verification_status ?? "not_checked"]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* 5. Evidence */}
      {(evidence ?? []).length > 0 && (
        <Section n="5" title="Evidence">
          <ul className="text-sm">
            {evidence!.map((e, i) => <li key={i} className="border-b border-slate-100 py-1">{e.title} <span className="text-slate-400">— {e.status}</span></li>)}
          </ul>
        </Section>
      )}

      {/* 6. Assurance tests */}
      {(tests ?? []).length > 0 && (
        <Section n="6" title="Assurance Tests">
          <table className="w-full text-xs">
            <tbody>
              {tests!.map((t, i) => (
                <tr key={i} className="border-b border-slate-100"><td className="py-1.5 pr-2">{t.objective}</td><td className="whitespace-nowrap text-slate-500">{t.result.replace("_", " ")}</td></tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* 7. Decision & conditions */}
      {(conditions ?? []).length > 0 && (
        <Section n="7" title="Conditions">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-slate-300 text-left text-slate-500"><th className="py-1">Condition</th><th>Owner</th><th>If not met</th><th>Status</th></tr></thead>
            <tbody>
              {conditions!.map((c, i) => (
                <tr key={i} className="border-b border-slate-100 align-top"><td className="py-1.5 pr-2">{c.text}</td><td className="pr-2 text-slate-500">{c.owner ?? "—"}</td><td className="pr-2 text-slate-500">{c.consequence ?? "—"}</td><td>{c.status}</td></tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      <p className="mt-8 border-t border-slate-200 pt-3 text-xs text-slate-400">
        Generated by {BRAND.name} · AI Control Architecture — app.neocontrol.ai · Methodology {String(tier ? "" : "")}v1.2. This report reflects the assessment and verification state at generation time.
      </p>
    </div>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="mb-2 border-b border-slate-200 pb-1 text-sm font-bold uppercase tracking-wide">
        {n}. {title}
      </h2>
      {children}
    </div>
  );
}
function Col({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-bold uppercase text-slate-400">{label}</p>
      <ul className="space-y-0.5 text-slate-600">{items.map((x, i) => <li key={i}>• {x}</li>)}</ul>
    </div>
  );
}
