import { auth } from "@clerk/nextjs/server";
import { getAuthContext } from "@/server/identity/auth-context";
import { notFound } from "next/navigation";
import { ensureOrg } from "@/lib/org";
import { supabaseAdmin } from "@/lib/supabase";
import { type Stage } from "@/lib/types/stages";
import { ChevronLeft } from "lucide-react";
import { Card, TierBadge, FunctionBadge } from "@/components/console/ui";
import { TIER_COLORS } from "@/components/console/theme";
import StageActions from "./stage-actions";
import StageChips from "./stage-chips";
import DecisionBoard from "./decision-board";
import { planFor } from "@/lib/plans";
import type { StackSelection } from "@/lib/tech-catalog";
import QuestionPanel from "./question-panel";
import UCTabs from "./uc-tabs";
import UseCaseTitle from "./use-case-title";
import { CAPABILITIES } from "@/server/fabric/capabilities";
import { syncDissents, loadOpenDissents } from "@/server/dissent/engine";
import { syncCalibration } from "@/server/calibration/predict";
import DissentCard from "@/components/console/dissent-card";

export default async function UseCaseDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { orgId, orgRole } = await getAuthContext();
  if (!orgId) return <p className="text-[var(--muted)]">Select an organization first.</p>;
  const internalOrgId = (await getAuthContext()).internalOrgId as string;
  const isAdmin = orgRole === "org:admin";
  const sb = supabaseAdmin();

  const [{ data: uc }, { data: orgRow }, { data: switchList }] = await Promise.all([
    sb.from("use_cases")
      .select("*")
      .eq("org_id", internalOrgId)
      .eq("id", id)
      .maybeSingle(),
    sb.from("organizations").select("plan, is_demo").eq("id", internalOrgId).single(),
    sb.from("use_cases").select("id, name").eq("org_id", internalOrgId).neq("status", "archived").order("updated_at", { ascending: false }),
  ]);
  if (!uc) notFound();
  const plan = planFor(orgRow?.plan);

  const [
    { data: stageRecords },
    { data: questions },
    { data: controls },
    { data: evidence },
    { data: tests },
    { data: conditions },
    { data: approval },
  ] = await Promise.all([
    sb.from("stage_records")
      .select("stage, accepted_output, accepted_at")
      .eq("org_id", internalOrgId).eq("use_case_id", id)
      .not("accepted_at", "is", null)
      .order("created_at", { ascending: true }),
    sb.from("questions")
      .select("id, text, answer, status")
      .eq("org_id", internalOrgId).eq("use_case_id", id)
      .order("created_at", { ascending: true }),
    sb.from("control_items")
      .select("id, pillar, control, why, requirement, status, stack_implementation, evidence, assurance_test, framework_refs, verification_status, verification_note, verified_at, artifact_type, capability_id, evidence_url")
      .eq("org_id", internalOrgId).eq("use_case_id", id)
      .order("pillar", { ascending: true }),
    sb.from("evidence_items")
      .select("id, title, status")
      .eq("org_id", internalOrgId).eq("use_case_id", id)
      .order("created_at", { ascending: true }),
    sb.from("assurance_tests")
      .select("id, objective, method, expected, owner, result, evidence_url")
      .eq("org_id", internalOrgId).eq("use_case_id", id)
      .order("created_at", { ascending: true }),
    sb.from("conditions")
      .select("id, text, owner, consequence, status")
      .eq("org_id", internalOrgId).eq("use_case_id", id)
      .order("created_at", { ascending: true }),
    sb.from("approvals")
      .select("decision, rationale")
      .eq("org_id", internalOrgId).eq("use_case_id", id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const { data: boardDecision } = await sb
    .from("board_decisions")
    .select("verdict, rationale, decided_by, created_at")
    .eq("org_id", internalOrgId).eq("use_case_id", id)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  // platform role: Clerk admin -> org_admin, else our memberships table
  const { userId } = await getAuthContext();
  let platformRole = "viewer";
  if (isAdmin) platformRole = "org_admin";
  else if (userId) {
    const { data: m } = await sb
      .from("memberships").select("role")
      .eq("org_id", internalOrgId).eq("user_id", userId).maybeSingle();
    platformRole = m?.role ?? "viewer";
  }
  const canAct = platformRole === "org_admin" || platformRole === "assessor";

  // live controls binding (Phase A): which capabilities have a connected provider, and the latest
  // live evidence per control. Available to integrations plans (Starter+) or any demo org.
  const liveControlsEnabled = plan.integrations || Boolean(orgRow?.is_demo);
  let connectedCapabilities: string[] = [];
  const liveByControl: Record<string, { result: string; rawArtifactRef: string | null; remediationHint: string | null; checkedAt: string | null; validUntil: string | null; provider: string | null }> = {};
  if (liveControlsEnabled) {
    const [{ data: conns }, { data: ctrlEv }] = await Promise.all([
      sb.from("org_connections").select("provider").eq("org_id", internalOrgId).eq("status", "connected"),
      sb.from("control_evidence")
        .select("control_id, result, raw_artifact_ref, remediation_hint, checked_at, valid_until, provider")
        .eq("org_id", internalOrgId).eq("use_case_id", id).not("control_id", "is", null)
        .order("checked_at", { ascending: false }),
    ]);
    const connectedProviders = new Set((conns ?? []).map((c) => c.provider));
    connectedCapabilities = Object.values(CAPABILITIES)
      .filter((cap) => cap.providers.some((p) => connectedProviders.has(p)))
      .map((cap) => cap.id);
    for (const e of ctrlEv ?? []) {
      const cid = e.control_id as string;
      if (cid && !liveByControl[cid]) {
        liveByControl[cid] = {
          result: e.result as string,
          rawArtifactRef: e.raw_artifact_ref as string | null,
          remediationHint: e.remediation_hint as string | null,
          checkedAt: e.checked_at as string | null,
          validUntil: e.valid_until as string | null,
          provider: e.provider as string | null,
        };
      }
    }
  }

  const accepted = (stage: string) =>
    (stageRecords ?? []).filter((r) => r.stage === stage).pop()?.accepted_output ?? null;

  // recover a generated-but-not-yet-accepted draft for the current stage
  // (survives navigation: the engine writes drafts server-side)
  const { data: pendingDraft } = await sb
    .from("stage_records")
    .select("ai_draft")
    .eq("org_id", internalOrgId)
    .eq("use_case_id", id)
    .eq("stage", uc.stage)
    .is("accepted_at", null)
    .not("ai_draft", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const classifyOut = accepted("classify");
  const tierOut = accepted("tier");

  // The per-use-case Red Team tab shows the findings LIST (red_team_findings) + the
  // run button; the animated replay + Live Fire live in the Red Team console.
  const openQuestions = (questions ?? []).filter((q) => q.status === "open");

  // living context: entries + staleness (context changed after the last accepted stage)
  const { data: contextEntries } = await sb
    .from("context_entries")
    .select("id, note, created_at")
    .eq("org_id", internalOrgId).eq("use_case_id", id)
    .order("created_at", { ascending: false });

  // Red Team findings (Enterprise)
  const { data: redTeamFindings } = plan.redTeam
    ? await sb.from("red_team_findings")
        .select("id, vector, technique, scenario, unguarded_outcome, severity, owasp_ref, atlas_ref, blocking_pillar, blocking_control, exposure")
        .eq("org_id", internalOrgId).eq("use_case_id", id)
        .order("severity", { ascending: true })
    : { data: [] };
  // Dissent + Calibration — Neo's own view, and the predictions it's willing to be scored on.
  // DEMO-GATED for now: the contradiction rules and the confidence priors have to earn their keep
  // before a real customer meets them. A wrong disagreement costs more trust than a right one buys.
  const judgementEnabled = Boolean(orgRow?.is_demo);
  let dissents: Awaited<ReturnType<typeof loadOpenDissents>> = [];
  if (judgementEnabled) {
    try {
      await syncDissents(internalOrgId);
      dissents = await loadOpenDissents(internalOrgId, id);
      // Commit the predictions here too, not just on the scorecard page — a prediction only counts
      // if it was made BEFORE the event that settles it, so it has to be written while the user is
      // still working, not lazily when someone opens the scoreboard.
      await syncCalibration(internalOrgId);
    } catch (e) {
      console.error("DISSENT SYNC", e);
    }
  }

  // controlId → Neo's objection, so the Controls tab can flag the exact row it's arguing about.
  const disputed: Record<string, { claim: string; reason: string; confidence: number }> = {};
  for (const d of dissents) {
    const cid = (d.evidence as { controlId?: string })?.controlId;
    if (cid) disputed[cid] = { claim: d.claim, reason: d.reason, confidence: Number(d.confidence) };
  }

  const acceptedAts = ((stageRecords ?? []).map((r) => r.accepted_at).filter(Boolean) as string[]).sort();
  const latestAccepted = acceptedAts.length ? acceptedAts[acceptedAts.length - 1] : null;
  const ctxUpdated = (uc as { context_updated_at?: string | null }).context_updated_at ?? null;
  const contextStale = Boolean(ctxUpdated && latestAccepted && ctxUpdated > latestAccepted);

  return (
    <div className="mx-auto max-w-5xl">
      {/* nav row — back to the list + report */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <a href="/dashboard/use-cases" className="inline-flex items-center gap-1 text-[13px] text-[var(--muted)] hover:text-[var(--text)]">
          <ChevronLeft size={15} /> Use cases
        </a>
        <a
          href={`/dashboard/use-cases/${uc.id}/report`}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)] hover:border-[#3b82f660] hover:text-[#3b82f6]"
        >
          Report / PDF
        </a>
      </div>
      {/* identity — the name is the switcher; readiness comes from the stage chips below */}
      <div className="flex flex-wrap items-center gap-2.5">
        <UseCaseTitle current={uc.id} name={uc.name} list={(switchList ?? []) as { id: string; name: string }[]} />
        {uc.tier && <TierBadge tier={uc.tier} />}
        {uc.business_function && <FunctionBadge fn={uc.business_function} />}
      </div>
      <p className="mb-2 mt-1 text-[13px] text-[var(--faint)]">
        {(uc.patterns ?? []).join(" / ") || "Pattern pending classification"}
      </p>
      {/* punchline */}
      {(tierOut?.punchline || tierOut?.rationale) && (
        <Card accent={TIER_COLORS[uc.tier ?? 3]} className="mb-5">
          <p className="text-sm italic leading-relaxed text-[var(--text)]">
            {tierOut?.punchline ?? String(tierOut?.rationale).split("\n")[0]}
          </p>
        </Card>
      )}
      {!tierOut?.punchline && !tierOut?.rationale && uc.description && (
        <Card className="mb-5">
          <p className="text-sm leading-relaxed text-[var(--muted)]">{uc.description}</p>
        </Card>
      )}

      {/* Dissent — where Neo's read of the evidence contradicts the human record. Sits high on the
          page on purpose: a disagreement you have to go looking for isn't a disagreement. The
          Controls tab also flags the disputed row and links back up here. */}
      {dissents.length > 0 && (
        <div id="neo-dissent" className="mb-5 scroll-mt-4 space-y-3">
          {dissents.map((d) => (
            <DissentCard key={d.id} dissent={d} canRespond={isAdmin} />
          ))}
        </div>
      )}

      {/* stage chips - completed stages are clickable to rewind & regenerate */}
      <StageChips useCaseId={uc.id} currentStage={uc.stage as Stage} />

      {/* context changed after assessment - prompt re-assessment, preserve human records */}
      {contextStale && (
        <div className="mt-4 rounded-md border border-[#f59e0b40] bg-[#f59e0b14] px-4 py-3 text-[13px] text-[var(--text)]">
          <span className="font-semibold text-[#f59e0b]">Context changed since this was assessed.</span>{" "}
          Regenerate the affected stages (click a completed stage above) so the classification, tier, and
          controls reflect the new context. Your recorded decisions and control verifications are kept, and
          should be reviewed.
        </div>
      )}

      {/* tech stack, ownership, governance & AI-BOM live on the Manage screen now —
          surface a nudge here only when the stack is still empty and required */}
      {((uc.stack as StackSelection)?.products?.length ?? 0) === 0 && plan.stackAwareControls && (
        <div className="mb-4 rounded-md border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-[13px] text-[var(--muted)]">
          Set up the tech stack and ownership on the{" "}
          <a href={`/dashboard/use-cases/${uc.id}/manage`} className="font-semibold text-[#3b82f6] hover:underline">Manage screen</a>{" "}
          before running the assessment.
        </div>
      )}

      {/* workflow panel (Operate state shows the rewind affordance) */}
      <StageActions
        useCaseId={uc.id}
        currentStage={uc.stage as Stage}
        useCaseName={uc.name}
        description={uc.description ?? ""}
        initialDraft={pendingDraft?.ai_draft ?? undefined}
        hasStack={
          !plan.stackAwareControls ||
          ((uc.stack as StackSelection)?.products?.length ?? 0) > 0
        }
        openQuestions={openQuestions.length}
      />

      {/* questions - only shown here while some still need answering; once all
          answered they live under the Questions tab so they don't crowd every view */}
      {openQuestions.length > 0 && <QuestionPanel questions={questions ?? []} />}

      {/* the console view - populated as stages complete */}
      <UCTabs
        tier={uc.tier}
        classify={classifyOut as never}
        tierOut={tierOut as never}
        questions={(questions ?? []) as never}
        controls={(controls ?? []) as never}
        evidence={(evidence ?? []) as never}
        tests={(tests ?? []) as never}
        conditions={(conditions ?? []) as never}
        approval={approval as never}
        canVerify={plan.verificationManual && canAct}
        liveVerify={plan.verificationLive}
        canAct={canAct}
        useCaseId={uc.id}
        ucName={uc.name as string}
        contextEntries={(contextEntries ?? []) as never}
        canRedTeam={plan.redTeam}
        redTeamFindings={(redTeamFindings ?? []) as never}
        liveControlsEnabled={liveControlsEnabled}
        connectedCapabilities={connectedCapabilities}
        liveByControl={liveByControl}
        disputed={disputed}
        stack={(uc.stack as StackSelection) ?? null}
        decisionSlot={
          <DecisionBoard
            useCaseId={uc.id}
            engineRecommendation={approval?.decision ?? null}
            latest={boardDecision as never}
            canDecide={isAdmin}
            planAllows={plan.decisionBoard !== "view"}
          />
        }
      />
    </div>
  );
}
