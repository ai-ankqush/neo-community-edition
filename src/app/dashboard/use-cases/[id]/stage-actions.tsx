"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { STAGE_LABELS, STAGES, type Stage } from "@/lib/types/stages";
import DraftPreview from "./draft-preview";
import { BRAND } from "@/lib/brand";

/** Honest, descriptive narration of what each stage is actually doing — cycled
 *  while the engine runs so it reads like a consultant at work. */
const ACTIVITY: Record<string, string[]> = {
  intake: ["Reading the use case…"],
  classify: ["Reading the use case description…", "Working out what the AI can see…", "…what it can decide…", "…and what it can do.", "Classifying the pattern and autonomy level."],
  tier: ["Weighing data sensitivity, decisions, and actions…", "Assigning the risk tier…", "Setting the escalation triggers."],
  questions: ["Working out what's still unknown…", "Drafting the few questions that actually change the controls…"],
  controls: ["Reviewing your stack and risk tier…", "Selecting controls across the 10 pillars…", "Mapping each control to your tools…", "Writing the implementation steps…"],
  evidence: ["Working out what proves each control…", "Building the evidence request list…"],
  assurance: ["Designing the tests that validate the controls…", "Setting the pass criteria…"],
  decision: ["Weighing the controls, evidence, and tests…", "Forming the recommended verdict and conditions…"],
  operate: ["Finalizing…"],
};

/**
 * The stage gate UI: generate an engine draft for the current stage,
 * review it, accept & advance. The engine is stubbed until Phase 1.2 -
 * the UI flow is identical once the real engine lands.
 */
export default function StageActions({
  useCaseId,
  currentStage,
  useCaseName,
  description,
  initialDraft,
  hasStack = true,
  openQuestions = 0,
}: {
  useCaseId: string;
  currentStage: Stage;
  useCaseName: string;
  description: string;
  initialDraft?: unknown;
  hasStack?: boolean;
  openQuestions?: number;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<unknown>(initialDraft ?? null);
  const [busy, setBusy] = useState<"generate" | "advance" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actIdx, setActIdx] = useState(0);

  // Classify + Risk Tier are confirm-or-correct gates: the customer must Confirm the
  // recommendation, or Suggest changes (which auto-updates the use case and re-runs).
  // "AI proposes; you check and decide."
  const isConfirmStage = currentStage === "classify" || currentStage === "tier";
  const [correcting, setCorrecting] = useState(false);
  const [correction, setCorrection] = useState("");
  const [applying, setApplying] = useState(false);
  const [liveDesc, setLiveDesc] = useState(description);
  const [checkedTriggers, setCheckedTriggers] = useState<Set<string>>(new Set());

  // Risk-tier: effective tier = max(base, highest newTier among confirmed triggers)
  const dObj = (draft ?? {}) as Record<string, unknown>;
  const baseTier = Number(dObj.tier) || 0;
  const tierTriggers = Array.isArray(dObj.escalationTriggers) ? (dObj.escalationTriggers as Record<string, unknown>[]) : [];
  const effectiveTier = tierTriggers.reduce((mx, tg, i) => {
    const tid = String(tg.id ?? i);
    const nt = Number(tg.newTier) || 0;
    return checkedTriggers.has(tid) && nt > mx ? nt : mx;
  }, baseTier);
  const toggleTrigger = (id: string) =>
    setCheckedTriggers((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  useEffect(() => {
    if (busy !== "generate") return;
    const lines = ACTIVITY[currentStage] ?? ["Working…"];
    const t = setInterval(() => setActIdx((i) => (i + 1) % lines.length), 3000);
    return () => clearInterval(t);
  }, [busy, currentStage]);

  const isFinal = currentStage === "operate";
  // Engine-backed stages require a reviewed draft before the gate can be confirmed
  const ENGINE_BACKED = new Set<Stage>([
    "classify", "tier", "questions", "controls", "evidence", "assurance", "decision",
  ]);
  const needsDraft = ENGINE_BACKED.has(currentStage) && draft == null;
  // Controls without a declared stack are generic English - block until captured
  const needsStack = currentStage === "controls" && !hasStack;
  // Controls from unanswered questions are guesswork - block until resolved
  const needsAnswers = currentStage === "controls" && openQuestions > 0;
  const blocked = needsStack || needsAnswers;

  const pollJob = (jobId: string, startedAt = Date.now()) => {
    const tick = async () => {
      try {
        const r = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        if (!r.ok) { setBusy(null); return; }
        const { job } = await r.json();
        if (job.status === "done") { setDraft(job.draft); setBusy(null); router.refresh(); }
        else if (job.status === "failed") { setError(job.error ?? "Engine failed"); setBusy(null); router.refresh(); }
        else if (Date.now() - startedAt > 8 * 60 * 1000) { setError("Still working in the background — the bell will notify you when it's ready."); setBusy(null); }
        else { setTimeout(tick, 2500); }
      } catch { setBusy(null); }
    };
    tick();
  };

  // Reattach the progress UI + poller if we navigated back while a job for this
  // stage is still running (run state otherwise lives only in this component).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/jobs", { cache: "no-store" });
        if (!r.ok) return;
        const { jobs } = await r.json();
        const running = (jobs ?? []).find(
          (j: { use_case_id: string; stage: string; status: string; id: string }) =>
            j.use_case_id === useCaseId && j.stage === currentStage && !["done", "failed"].includes(j.status)
        );
        if (running && !cancelled) { setBusy("generate"); setActIdx(0); pollJob(running.id); }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useCaseId, currentStage]);

  async function generate(descOverride?: string) {
    setBusy("generate");
    setActIdx(0);
    setError(null);
    setCheckedTriggers(new Set()); // a fresh proposal starts with no confirmed triggers
    try {
      const res = await fetch("/api/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          useCaseId,
          stage: currentStage,
          input: { name: useCaseName, description: descOverride ?? liveDesc },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Engine error");

      // Background job: poll until done. Navigating away is safe — the draft
      // persists server-side, the bell announces completion, and on return the
      // mount effect above reattaches this progress UI to the still-running job.
      pollJob(json.jobId as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Engine call failed");
      setBusy(null);
    }
  }

  /** "Suggest changes": append the customer's clarification to the use case (auto-update),
   *  then re-run this stage so the proposal reflects their real intent. */
  async function applyCorrection() {
    const text = correction.trim();
    if (!text || applying) return;
    setApplying(true);
    setError(null);
    try {
      const newDesc = `${liveDesc}\n\n[Clarification — ${STAGE_LABELS[currentStage]}] ${text}`;
      const res = await fetch(`/api/use-cases/${useCaseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", description: newDesc }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Could not update the use case");
      setLiveDesc(newDesc);
      setCorrection("");
      setCorrecting(false);
      setDraft(null);
      await generate(newDesc); // re-run this stage against the corrected use case
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the use case");
    } finally {
      setApplying(false);
    }
  }

  async function goBack() {
    if (
      !confirm(
        "Go back one stage? The previous stage's accepted output and everything it created (questions, controls, etc.) will be removed so it can be redone."
      )
    )
      return;
    setBusy("advance");
    setError(null);
    try {
      const res = await fetch(`/api/use-cases/${useCaseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "back" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Failed to go back");
      setDraft(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to go back");
    } finally {
      setBusy(null);
    }
  }

  async function acceptAndAdvance() {
    setBusy("advance");
    setError(null);
    try {
      // On Risk Tier, the confirmed triggers set the effective tier that drives controls;
      // keep the base tier + confirmed trigger ids in the accepted record for the audit trail.
      let acceptedDraft = draft ?? undefined;
      if (currentStage === "tier" && draft) {
        acceptedDraft = { ...(draft as Record<string, unknown>), tier: effectiveTier, baseTier, confirmedTriggerIds: [...checkedTriggers] };
      }
      const res = await fetch(`/api/use-cases/${useCaseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "advance", acceptedDraft }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Failed to advance");
      setDraft(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to advance");
    } finally {
      setBusy(null);
    }
  }

  if (isFinal) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-[#22c55e40] bg-[#22c55e14] p-5 text-sm text-[var(--good)]">
        <span>
          This use case is in <b>Operate</b>: roadmap live, reassessment triggers armed.
        </span>
        <button
          onClick={goBack}
          disabled={busy !== null}
          className="ml-4 shrink-0 rounded-md border border-[#22c55e40] px-3 py-1.5 text-xs font-semibold text-[var(--good)] hover:bg-[#22c55e1f] disabled:opacity-50"
        >
          ← Back to Decision
        </button>
      </div>
    );
  }

  const isIntake = currentStage === "intake";

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
      {/* stage stepper — where you are in the 9-stage assessment */}
      <div className="mb-2 flex items-center gap-1">
        {STAGES.map((s) => {
          const ci = STAGES.indexOf(currentStage);
          const i = STAGES.indexOf(s);
          const cls = i < ci ? "bg-[#22c55e]" : i === ci ? "bg-[#3b82f6]" : "bg-[var(--border)]";
          return <div key={s} title={STAGE_LABELS[s]} className={`h-1.5 flex-1 rounded-full ${cls}`} />;
        })}
      </div>
      <p className="mb-3 text-[11px] font-medium text-[var(--faint)]">
        Step {STAGES.indexOf(currentStage) + 1} of {STAGES.length} · {STAGE_LABELS[currentStage]}
      </p>
      <h2 className="mb-1 font-semibold text-[var(--text)]">
        Current stage: {STAGE_LABELS[currentStage]}
      </h2>
      <p className="mb-4 text-sm text-[var(--muted)]">
        {isIntake
          ? "Intake is yours, not the engine's: make sure the description covers what the AI does, what it can access, and who uses it - and capture the technology stack above. Then confirm to start the assessment."
          : isConfirmStage
            ? `Run the engine, then check its proposal. Confirm it if it's right — that's your sign-off, and it's what the controls are built on. If anything's wrong, Suggest changes: tell ${BRAND.name} what's actually true and it updates the use case and re-runs. AI proposes; you check and decide.`
            : "Run the engine for this stage, review the proposal, then accept it to advance. Accepting is your sign-off - the human-in-the-loop step the methodology requires. To change a result, accept and continue, then rewind here later to re-run."}
      </p>

      <div className="flex flex-wrap gap-3">
        {!isIntake && (
          <button
            onClick={goBack}
            disabled={busy !== null || applying}
            title="Un-accept the previous stage and redo it"
            className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--muted)] hover:bg-[var(--panel)] disabled:opacity-50"
          >
            ← Back
          </button>
        )}
        {!isIntake && (
          <button
            onClick={() => generate()}
            disabled={busy !== null || blocked || applying}
            title={
              needsStack
                ? "Capture the technology stack first (panel above)"
                : needsAnswers
                  ? "Answer the open questions first (below)"
                  : undefined
            }
            className="rounded-md bg-[var(--text)] px-5 py-2 text-sm font-semibold text-[var(--bg)] disabled:opacity-50"
          >
            {busy === "generate" ? "Running engine..." : draft != null ? "Re-run" : "Run engine"}
          </button>
        )}

        {/* Classify + Risk Tier: confirm-or-correct. Other stages: plain accept. */}
        {isConfirmStage ? (
          !correcting && (
            <>
              <button
                onClick={acceptAndAdvance}
                disabled={busy !== null || needsDraft || applying}
                title={needsDraft ? "Run and review the proposal first" : undefined}
                className="rounded-md bg-[#22c55e] px-5 py-2 text-sm font-semibold text-black disabled:opacity-50"
              >
                {busy === "advance" ? "Confirming…" : "✔ Confirm — this is correct →"}
              </button>
              <button
                onClick={() => setCorrecting(true)}
                disabled={busy !== null || needsDraft || applying}
                className="rounded-md border border-[var(--border)] px-5 py-2 text-sm font-semibold text-[var(--text)] hover:bg-[var(--panel)] disabled:opacity-50"
              >
                ✎ Suggest changes
              </button>
            </>
          )
        ) : (
          <button
            onClick={acceptAndAdvance}
            disabled={busy !== null || needsDraft}
            title={needsDraft ? "Generate and review the engine draft first" : undefined}
            className="rounded-md bg-[#3b82f6] px-5 py-2 text-sm font-semibold text-[var(--text)] disabled:opacity-50"
          >
            {busy === "advance"
              ? "Advancing..."
              : isIntake
                ? "Confirm intake & start assessment →"
                : "Accept & advance →"}
          </button>
        )}
      </div>

      {/* Suggest changes → auto-update the use case, then re-run this stage */}
      {isConfirmStage && correcting && (
        <div className="mt-4 rounded-lg border border-[#f59e0b40] bg-[#f59e0b0a] p-4">
          <p className="text-[13px] font-semibold text-[var(--text)]">What&apos;s actually true?</p>
          <p className="mb-2 text-[12px] text-[var(--muted)]">
            Tell {BRAND.name} what this AI really can — or can&apos;t — do. We&apos;ll add it to the use case and re-run {STAGE_LABELS[currentStage]} so the record matches your intent.
          </p>
          <textarea
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            rows={3}
            placeholder="e.g. The AI has no write access to the CRM — it can only read. It never emails the counterparty."
            className="w-full rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[#f59e0b]"
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={applyCorrection}
              disabled={applying || !correction.trim()}
              className="rounded-md bg-[#f59e0b] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
            >
              {applying ? "Updating & re-running…" : "Update use case & re-run →"}
            </button>
            <button
              onClick={() => { setCorrecting(false); setCorrection(""); }}
              disabled={applying}
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--muted)] hover:bg-[var(--panel)] disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {needsStack && (
        <p className="mt-2 text-xs text-[#f59e0b]">
          Declare the technology stack first (panel above) — controls are only useful when
          mapped to your actual tools. Without the stack, implementation steps, evidence, and
          tests would be generic.
        </p>
      )}
      {needsAnswers && (
        <p className="mt-2 text-xs text-[#f59e0b]">
          {openQuestions} question{openQuestions === 1 ? "" : "s"} still open (below). Answer
          them — or mark them N/A — before generating controls. Controls built on unanswered
          questions are guesswork.
        </p>
      )}
      {needsDraft && busy !== "generate" && !needsStack && (
        <p className="mt-2 text-xs text-[var(--faint)]">
          Run the engine and review the proposal before accepting.
        </p>
      )}
      {busy === "generate" && (
        <div className="mt-4 rounded-lg border border-[#3b82f640] bg-[#3b82f608] p-4">
          <div className="flex items-center gap-3">
            <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[#3b82f6] border-t-transparent" />
            <span className="text-[13px] font-semibold text-[var(--text)]">{BRAND.name} is working on {STAGE_LABELS[currentStage]}</span>
          </div>
          <p className="mt-2 text-[12.5px] text-[var(--muted)]">{(ACTIVITY[currentStage] ?? ["Working…"])[actIdx % (ACTIVITY[currentStage]?.length ?? 1)]}</p>
          {currentStage === "controls" && (
            <p className="mt-1 text-[11px] text-[var(--faint)]">This is the deepest step — mapping every pillar to your stack. It can take ~30–60s.</p>
          )}
          <p className="mt-2 text-[11px] text-[#4b5563]">Runs in the background — you can navigate anywhere; the bell (top right) notifies you when it&apos;s ready.</p>
        </div>
      )}

      {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}

      {draft != null && (
        <DraftPreview
          stage={currentStage}
          draft={draft}
          triggerState={
            currentStage === "tier"
              ? { checked: checkedTriggers, onToggle: toggleTrigger, baseTier, effectiveTier }
              : undefined
          }
        />
      )}
    </div>
  );
}
