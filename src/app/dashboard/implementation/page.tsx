import Link from "next/link";
import { getAuthContext } from "@/server/identity/auth-context";
import { auth } from "@clerk/nextjs/server";
import { portfolioContext } from "@/lib/portfolio";
import { supabaseAdmin } from "@/lib/supabase";
import { planFor } from "@/lib/plans";
import { Card } from "@/components/console/ui";
import ImplementationList, { type DeployRow } from "./implementation-list";
import { BRAND } from "@/lib/brand";

/** Compact relative time, e.g. "2h ago", "3d ago". */
function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default async function ImplementationPage() {
  const ctx = await portfolioContext();
  if (!ctx) return <p className="text-[var(--muted)]">Select an organization first.</p>;
  const sb = supabaseAdmin();

  const [{ data: orgRow }, { data: controls }, { data: controlStages }, { data: activeJobs }] = await Promise.all([
    sb.from("organizations").select("plan").eq("id", ctx.internalOrgId).single(),
    sb.from("control_items")
      .select("use_case_id, artifact_type, artifact_generated_at")
      .eq("org_id", ctx.internalOrgId),
    // when the Controls stage was last accepted — re-running an assessment
    // produces a newer acceptance, which makes any prior code stale
    sb.from("stage_records")
      .select("use_case_id, accepted_at")
      .eq("org_id", ctx.internalOrgId).eq("stage", "controls")
      .not("accepted_at", "is", null),
    // in-flight code-generation jobs, so the progress bar resumes after navigation
    sb.from("engine_jobs")
      .select("id, use_case_id")
      .eq("org_id", ctx.internalOrgId).eq("stage", "artifacts").in("status", ["queued", "running"]),
  ]);
  const plan = planFor(orgRow?.plan);

  // newest active artifacts job per use case (to resume the progress bar)
  const activeByUc = new Map<string, string>();
  for (const j of activeJobs ?? []) {
    if (j.use_case_id && !activeByUc.has(j.use_case_id)) activeByUc.set(j.use_case_id as string, j.id as string);
  }

  // latest Controls-stage acceptance per use case
  const controlsAcceptedAt = new Map<string, string>();
  for (const s of controlStages ?? []) {
    const prev = controlsAcceptedAt.get(s.use_case_id);
    if (!prev || (s.accepted_at && s.accepted_at > prev)) controlsAcceptedAt.set(s.use_case_id, s.accepted_at as string);
  }

  // platform role: Clerk admin -> org_admin, else our memberships table
  const { orgRole, userId } = await getAuthContext();
  let platformRole = "viewer";
  if (orgRole === "org:admin") platformRole = "org_admin";
  else if (userId) {
    const { data: m } = await sb
      .from("memberships").select("role")
      .eq("org_id", ctx.internalOrgId).eq("user_id", userId).maybeSingle();
    platformRole = m?.role ?? "viewer";
  }
  const canAct = platformRole === "org_admin" || platformRole === "assessor";

  // per-use-case control + artifact counts (+ newest generation timestamp).
  // Split by artifact type: detection rules (Detect pillar) vs prevention code.
  const stats = new Map<string, { total: number; withArtifact: number; preventCount: number; detectCount: number; lastGen: string | null }>();
  for (const c of controls ?? []) {
    const s = stats.get(c.use_case_id) ?? { total: 0, withArtifact: 0, preventCount: 0, detectCount: 0, lastGen: null };
    s.total += 1;
    if (c.artifact_type) {
      s.withArtifact += 1;
      if (c.artifact_type === "detection") s.detectCount += 1;
      else s.preventCount += 1;
    }
    const g = c.artifact_generated_at as string | null;
    if (g && (!s.lastGen || g > s.lastGen)) s.lastGen = g;
    stats.set(c.use_case_id, s);
  }

  // freshness: code is stale if the Controls stage was re-accepted after the
  // last generation, or if some controls still have no code
  function freshness(useCaseId: string, total: number, withArtifact: number, lastGen: string | null) {
    if (withArtifact === 0) return { state: "none" as const, label: null as string | null };
    const accepted = controlsAcceptedAt.get(useCaseId);
    if (accepted && lastGen && accepted > lastGen)
      return { state: "stale" as const, label: "Controls re-run since — regenerate" };
    if (withArtifact < total)
      return { state: "stale" as const, label: `${total - withArtifact} control${total - withArtifact === 1 ? "" : "s"} without code — regenerate` };
    return { state: "fresh" as const, label: `Up to date · generated ${relTime(lastGen!)}` };
  }

  // only use cases that have reached the Controls stage are actionable
  const rows = ctx.useCases
    .map((u) => ({ ...u, ...(stats.get(u.id) ?? { total: 0, withArtifact: 0, preventCount: 0, detectCount: 0, lastGen: null }) }))
    .sort((a, b) => b.total - a.total);
  const ready = rows.filter((r) => r.total > 0);
  const pending = rows.filter((r) => r.total === 0);

  const deployRows: DeployRow[] = ready.map((r) => {
    const f = freshness(r.id, r.total, r.withArtifact, r.lastGen);
    return {
      id: r.id,
      name: r.name,
      tier: r.tier,
      business_function: (r as { business_function?: string | null }).business_function ?? null,
      total: r.total,
      withArtifact: r.withArtifact,
      preventCount: r.preventCount,
      detectCount: r.detectCount,
      freshState: f.state,
      freshLabel: f.label,
      activeJobId: activeByUc.get(r.id) ?? null,
      // code-gen plans gate the pack on generated code; base plans (runbook pack) are always ready
      packReady: r.withArtifact > 0 || !plan.codeGeneration,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold">Build &amp; Deploy</h2>
        <p className="mt-1 text-[13px] text-[var(--faint)]">
          Hand the controls to engineering — as a runbook pack, or as generated code per control.
        </p>
      </div>

      {/* explainer: the two things you can do here */}
      <div className="grid gap-3.5 md:grid-cols-2">
        <Card className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[15px]">↓</span>
            <h3 className="text-[14px] font-semibold text-[var(--text)]">Implementation Pack</h3>
          </div>
          <p className="text-[12.5px] leading-relaxed text-[var(--muted)]">
            A zip your engineers can open and act on. Inside: a master checklist, a per-control
            runbook (why it matters, how to implement it on your stack, the test that proves it
            works, and the evidence to capture), and a <code className="text-[#a5b4fc]">tickets.csv</code> you
            can import straight into Jira or Linear. This is the <strong>plain-language</strong> handoff —
            available on every plan.
          </p>
        </Card>
        <Card className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[15px]">✦</span>
            <h3 className="text-[14px] font-semibold text-[var(--text)]">Generated code artifacts</h3>
            <span className="ml-auto rounded-full bg-[#3b82f61a] px-2 py-0.5 text-[10px] font-semibold text-[#3b82f6]">
              Premium +
            </span>
          </div>
          <p className="text-[12.5px] leading-relaxed text-[var(--muted)]">
            Goes a step further: {BRAND.name} writes <strong>real code</strong> for each control, mapped to your
            declared stack — Terraform, policy-as-code, or a config snippet. These are
            <strong> review-before-apply scaffolds</strong>, not blind <code className="text-[#a5b4fc]">apply</code> scripts:
            every environment-specific value is flagged with a <code className="text-[#a5b4fc]">TODO</code> for
            your team to set. Generate once; they&apos;re stored and folded into the same pack zip
            (<code className="text-[#a5b4fc]">terraform/</code>, <code className="text-[#a5b4fc]">policies/</code>,
            <code className="text-[#a5b4fc]"> config/</code>).
          </p>
        </Card>
      </div>

      {!plan.codeGeneration && (
        <div className="rounded-md border border-[#3b82f640] bg-[#3b82f61a] px-4 py-2.5 text-[12.5px] text-[var(--text)]">
          Code generation is a Premium &amp; Enterprise feature. The Implementation Pack (runbooks +
          tickets) is included on your plan. <Link href="/dashboard/plans" className="font-semibold text-[#3b82f6]">Compare plans →</Link>
        </div>
      )}

      {/* per use case */}
      <div className="flex flex-col gap-3">
        <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--faint)]">By use case</h3>

        <ImplementationList rows={deployRows} canGenerate={plan.codeGeneration && canAct} />

        {pending.length > 0 && (
          <p className="mt-1 text-[12px] text-[var(--faint)]">
            Not yet at the Controls stage: {pending.map((p) => p.name).join(", ")}.
          </p>
        )}
      </div>
    </div>
  );
}
