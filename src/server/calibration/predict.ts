import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { learnRates, calibrate } from "./learn";

/**
 * CALIBRATED PREDICTION — Neo says what will happen, before it happens, with a number attached.
 * Then the world settles it, and Neo publishes its own hit rate.
 *
 * The design constraint that makes this real rather than theatre:
 *
 *   A prediction is only worth counting if it can be settled WITHOUT A HUMAN ADJUDICATING IT.
 *
 * That is why we don't just score dissents. A dissent resolves when a human agrees or overrules —
 * which scores Neo on the human's agreement, not on reality, and rewards telling people what they
 * want to hear. These predictions resolve against events the system produces anyway: a verification
 * check runs, a Red Team run happens, a clock expires. Nobody, including us, can massage the
 * denominator.
 *
 * Second constraint: a prediction only counts if it was made STRICTLY BEFORE the event that settled
 * it. Enforced in resolvePredictions() by comparing timestamps. No retroactive genius.
 */

export type PredictionKind =
  | "control_verify_fail"      // "this control will FAIL when you actually check it"  → settled by a live verification
  | "redteam_still_exposed"    // "this path will STILL be exposed next run"           → settled by the next Red Team run
  | "evidence_never_arrives";  // "this control will still have no proof in 30 days"   → settled by the clock

export interface PredictionRow {
  id: string;
  use_case_id: string | null;
  kind: string;
  claim: string;
  basis: string;
  confidence: number;
  subject_ref: string | null;
  subject_label: string | null;
  status: string;
  outcome: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
  expires_at: string | null;
  created_at: string;
}

export const KIND_LABEL: Record<string, string> = {
  control_verify_fail: "Control will fail verification",
  redteam_still_exposed: "Path will still be exposed",
  evidence_never_arrives: "Proof will not arrive",
};

const EVIDENCE_HORIZON_DAYS = 30;

/**
 * Make predictions from the current state of the estate.
 *
 * Confidences here are PRIORS — deterministic, stated, and defensible. They are the starting
 * numbers Neo is willing to be held to. Once the scorecard has real resolutions, these get
 * re-derived from the observed hit rate per (kind, bucket): that feedback loop is the point of
 * the whole exercise, and it's the difference between a system that asserts and one that learns
 * how much to trust itself.
 */
export async function makePredictions(orgId: string): Promise<number> {
  const sb = supabaseAdmin();

  const [{ data: controls }, { data: findings }, { data: evidence }] = await Promise.all([
    sb.from("control_items")
      .select("id, use_case_id, control, status, verification_status, capability_id, pillar")
      .eq("org_id", orgId).eq("status", "in_place"),
    sb.from("red_team_findings")
      .select("id, use_case_id, technique, severity, exposure, blocking_control, blocking_pillar, generated_at")
      .eq("org_id", orgId).eq("exposure", "exposed"),
    sb.from("control_evidence")
      .select("control_id, result, checked_at").eq("org_id", orgId),
  ]);

  const attested = controls ?? [];
  const exposed = findings ?? [];
  const hasEvidence = new Set((evidence ?? []).map((e) => e.control_id as string).filter(Boolean));

  /**
   * THE LOAD-BEARING DISTINCTION.
   *
   * `verification_status = 'verified'` can be set two ways: by a live connector check, or by a
   * human picking "Verified" from a dropdown. The column doesn't say which. If we treated both as
   * proof, anyone could silence Neo by hand-marking a control verified — attesting their way out
   * of scrutiny, which is the exact failure mode this whole feature exists to catch.
   *
   * So: only a control with a real control_evidence row from a check that actually ran counts as
   * proven. A hand-marked "verified" is just a louder attestation, and Neo keeps its bet open.
   */
  const provenLive = new Set(
    (evidence ?? [])
      .filter((e) => ["pass", "fail", "partial"].includes(e.result as string))
      .map((e) => e.control_id as string)
      .filter(Boolean),
  );

  // Which attested controls does a live exposed path implicate? Join on PILLAR, not on control
  // name: `blocking_pillar` and `control_items.pillar` are the same structured taxonomy, whereas
  // the two name fields are free text from different prompts and essentially never match. (The
  // first cut of this joined on names and found nothing on real data.)
  const doubted = new Map<string, { technique: string; severity: string }>();
  for (const f of exposed) {
    const pillar = f.blocking_pillar as number | null;
    if (!pillar) continue;
    for (const c of attested) {
      if (c.use_case_id !== f.use_case_id) continue;
      if ((c.pillar as number) !== pillar) continue;
      const prev = doubted.get(c.id as string);
      // keep the worst finding implicating this control
      if (!prev || (prev.severity !== "critical" && f.severity === "critical")) {
        doubted.set(c.id as string, { technique: f.technique as string, severity: f.severity as string });
      }
    }
  }

  const rows: Record<string, unknown>[] = [];
  const now = Date.now();

  // ── 1 · "This control will fail when you actually verify it." ───────────────
  // Only for controls that CAN be verified live (they have a capability binding) and haven't been.
  // An attestation is a claim; this is Neo betting on whether the claim survives contact.
  for (const c of attested) {
    if (!c.capability_id) continue;                  // nothing to check it against — no honest bet
    if (provenLive.has(c.id as string)) continue;    // a check actually ran: reality already settled it
    const d = doubted.get(c.id as string);
    // Prior: a control an attack already walked through is very likely to fail a real check.
    // One with no live evidence at all is a coin-flip leaning fail. Stated plainly, held to.
    // A control someone hand-marked "verified" with nothing behind it is, if anything, MORE
    // suspect than one honestly left unverified — the claim got stronger while the proof stayed
    // at zero. So Neo nudges its confidence up rather than backing off.
    const selfDeclared = c.verification_status === "verified";
    const base = d ? (d.severity === "critical" ? 0.85 : 0.75) : 0.4;
    const confidence = Math.min(0.95, selfDeclared ? base + 0.1 : base);
    rows.push({
      org_id: orgId, use_case_id: c.use_case_id, kind: "control_verify_fail",
      claim: `"${c.control}" will fail when you verify it live.`,
      basis: d
        ? `It's attested in place, but Red Team's "${d.technique}" (${d.severity}) went straight through it. Attestation and attack result disagree; I'm backing the attack.${selfDeclared ? ` It's also been hand-marked verified — but no check has ever run against it, so that's a claim, not proof.` : ""}`
        : selfDeclared
          ? `It's marked verified, but no live check has ever run against it — someone set that by hand. A stronger claim with the same amount of evidence behind it (none) doesn't make me more comfortable; it makes me less.`
          : `It's attested in place but has never been checked against a live system. Unverified attestations fail more often than people expect — I'm saying so before the check, not after.`,
      confidence, subject_ref: c.id, subject_label: c.control,
      fingerprint: `control_verify_fail:${c.id}`,
    });
  }

  // ── 2 · "This path will still be exposed at your next Red Team run." ────────
  // Settled by the next run, which happens for its own reasons — clean ground truth.
  for (const f of exposed) {
    if (!["critical", "high"].includes((f.severity as string) ?? "")) continue;
    // Same pillar join — does anything the org claims is in place even sit in the layer that's
    // supposed to stop this?
    const blocker = attested.find(
      (c) => c.use_case_id === f.use_case_id && (c.pillar as number) === (f.blocking_pillar as number | null),
    );
    // If nothing even claims to block it, it will almost certainly still be there. If something
    // claims to block it AND a real check has run, Neo genuinely backs off. A hand-marked
    // "verified" earns no such discount — same reasoning as above.
    const blockerProven = blocker ? provenLive.has(blocker.id as string) : false;
    const confidence = !blocker ? 0.8 : blockerProven ? 0.35 : 0.6;
    rows.push({
      org_id: orgId, use_case_id: f.use_case_id, kind: "redteam_still_exposed",
      claim: `"${f.technique}" will still be exposed at your next Red Team run.`,
      basis: !blocker
        ? `Nothing on this use case currently claims to block it.`
        : blockerProven
          ? `"${blocker.control}" has been checked live against it, so I could well be wrong here — but the last run still came back exposed.`
          : `"${blocker.control}" is meant to block it, but no live check has ever run against it — it's only been attested.`,
      confidence, subject_ref: String(f.id), subject_label: f.technique,
      fingerprint: `redteam_still_exposed:${f.id}`,
    });
  }

  // ── 3 · "You will still have no proof of this in 30 days." ──────────────────
  // The clock settles this one. Uncomfortable, and that's the value: governance decays quietly.
  const horizon = new Date(now + EVIDENCE_HORIZON_DAYS * 86400_000).toISOString();
  for (const c of attested) {
    if (hasEvidence.has(c.id as string)) continue;   // proof already exists — nothing to predict
    const selfDeclared = c.verification_status === "verified";
    rows.push({
      org_id: orgId, use_case_id: c.use_case_id, kind: "evidence_never_arrives",
      claim: `"${c.control}" will still have no evidence behind it in ${EVIDENCE_HORIZON_DAYS} days.`,
      basis: selfDeclared
        ? `It's marked verified, but there's nothing attached to it — no check has ever run. The status says proven; the record says nothing. I'm betting the record doesn't change.`
        : `It's marked in place with nothing attached to prove it. Controls that sit unproven tend to keep sitting unproven — I'd rather say that now than note it in a report later.`,
      confidence: 0.7, subject_ref: c.id, subject_label: c.control,
      expires_at: horizon,
      fingerprint: `evidence_never_arrives:${c.id}:${new Date(now).toISOString().slice(0, 7)}`, // one per control per month
    });
  }

  if (!rows.length) return 0;

  // ── THE LEARNING LOOP CLOSES HERE ────────────────────────────────────────────
  // Everything above produced a PRIOR — a reasoned number I chose. Now Neo checks its own track
  // record for this kind of claim at this strength and speaks with the number the world gave it
  // instead. Where it has no record, the prior stands. We keep BOTH on the row, so the scorecard
  // can show what Neo used to believe, what it believes now, and what changed its mind.
  const rates = await learnRates(orgId);
  for (const r of rows) {
    const prior = r.confidence as number;
    const learned = calibrate(rates, r.kind as string, prior);
    r.prior_confidence = prior;
    r.confidence = learned;
    if (Math.abs(learned - prior) >= 0.02) {
      // Neo says so out loud. A model that quietly revises itself is not trustworthy, however
      // accurate it becomes — the adjustment has to be inspectable.
      r.basis = `${r.basis} (Last time I said ~${Math.round(prior * 100)}% on a claim like this I was right ` +
        `${Math.round(learned * 100)}% of the time, so that's the number I'm using.)`;
    }
  }

  // ignoreDuplicates: a prediction is made ONCE. Neo does not get to revise a bet after the fact.
  const { error } = await sb.from("predictions").upsert(rows, { onConflict: "org_id,fingerprint", ignoreDuplicates: true });
  if (error) throw error;
  return rows.length;
}

/**
 * Resolve open predictions against ground truth that has since arrived.
 * The strict rule enforced everywhere below: the settling event must POSTDATE the prediction.
 */
export async function resolvePredictions(orgId: string): Promise<number> {
  const sb = supabaseAdmin();
  const { data: open } = await sb.from("predictions")
    .select("id, kind, subject_ref, confidence, created_at, expires_at")
    .eq("org_id", orgId).eq("status", "open");
  if (!open?.length) return 0;

  const controlIds = open.filter((p) => p.kind !== "redteam_still_exposed").map((p) => p.subject_ref).filter(Boolean) as string[];
  const findingIds = open.filter((p) => p.kind === "redteam_still_exposed").map((p) => p.subject_ref).filter(Boolean) as string[];

  const [{ data: evidence }, { data: findings }, { data: controls }] = await Promise.all([
    controlIds.length
      ? sb.from("control_evidence").select("control_id, result, checked_at").eq("org_id", orgId).in("control_id", controlIds).order("checked_at", { ascending: true })
      : Promise.resolve({ data: [] as { control_id: string; result: string; checked_at: string }[] }),
    findingIds.length
      ? sb.from("red_team_findings").select("id, exposure, generated_at").eq("org_id", orgId).in("id", findingIds.map(Number).filter((n) => !Number.isNaN(n)))
      : Promise.resolve({ data: [] as { id: number; exposure: string; generated_at: string }[] }),
    controlIds.length
      ? sb.from("control_items").select("id, verification_status, verified_at").eq("org_id", orgId).in("id", controlIds)
      : Promise.resolve({ data: [] as { id: string; verification_status: string | null; verified_at: string | null }[] }),
  ]);

  const evByControl = new Map<string, { result: string; checked_at: string }[]>();
  for (const e of (evidence ?? []) as { control_id: string; result: string; checked_at: string }[]) {
    const list = evByControl.get(e.control_id) ?? [];
    list.push({ result: e.result, checked_at: e.checked_at });
    evByControl.set(e.control_id, list);
  }
  const ctrlById = new Map((controls ?? []).map((c) => [c.id as string, c]));
  const findById = new Map((findings ?? []).map((f) => [String(f.id), f]));

  const nowIso = new Date().toISOString();
  let resolved = 0;

  for (const p of open) {
    const madeAt = p.created_at as string;
    const ref = p.subject_ref as string | null;
    if (!ref) continue;

    if (p.kind === "control_verify_fail") {
      // Settled by a live check that ran AFTER the prediction was made.
      const check = (evByControl.get(ref) ?? []).find((e) => e.checked_at > madeAt && ["pass", "fail"].includes(e.result));
      if (check) {
        const neoSaidFail = true;                       // this kind always predicts failure
        const actuallyFailed = check.result === "fail";
        await sb.from("predictions").update({
          status: "resolved", outcome: neoSaidFail === actuallyFailed ? "correct" : "incorrect",
          resolved_at: nowIso, resolved_by: "verification",
          resolution_note: `Live check came back ${check.result}.`,
        }).eq("id", p.id);
        resolved++;
        continue;
      }
      // A human marking it "verified" by hand is NOT ground truth — that's the same attestation
      // Neo doubted, restated. We wait for a real check. (Noted here so nobody "fixes" it later.)
      const c = ctrlById.get(ref);
      if (c?.verification_status === "verified" && c.verified_at && (c.verified_at as string) > madeAt) {
        // deliberately left OPEN — no resolution from self-attestation.
      }
    }

    if (p.kind === "redteam_still_exposed") {
      const f = findById.get(ref);
      // Settled only by a run that regenerated this finding after the prediction.
      if (f && (f.generated_at as string) > madeAt) {
        const stillExposed = f.exposure === "exposed";
        await sb.from("predictions").update({
          status: "resolved", outcome: stillExposed ? "correct" : "incorrect",
          resolved_at: nowIso, resolved_by: "redteam_run",
          resolution_note: `Next run came back "${f.exposure}".`,
        }).eq("id", p.id);
        resolved++;
        continue;
      }
      // Finding gone entirely = the path was closed out. Neo said it would still be there: wrong.
      if (!f) {
        await sb.from("predictions").update({
          status: "resolved", outcome: "incorrect", resolved_at: nowIso, resolved_by: "redteam_run",
          resolution_note: "The finding no longer exists — the path was closed. I was wrong.",
        }).eq("id", p.id);
        resolved++;
      }
    }

    if (p.kind === "evidence_never_arrives") {
      const expires = p.expires_at as string | null;
      const gotEvidence = (evByControl.get(ref) ?? []).some((e) => e.checked_at > madeAt);
      if (gotEvidence) {
        // Proof arrived inside the window — Neo was wrong, and happily so.
        await sb.from("predictions").update({
          status: "resolved", outcome: "incorrect", resolved_at: nowIso, resolved_by: "verification",
          resolution_note: "Evidence arrived inside the window. I was wrong — good.",
        }).eq("id", p.id);
        resolved++;
      } else if (expires && expires < nowIso) {
        await sb.from("predictions").update({
          status: "resolved", outcome: "correct", resolved_at: nowIso, resolved_by: "clock",
          resolution_note: "The window closed with nothing attached.",
        }).eq("id", p.id);
        resolved++;
      }
    }
  }

  return resolved;
}

/** One call: commit new predictions, then settle any the world has answered. */
export async function syncCalibration(orgId: string): Promise<void> {
  await makePredictions(orgId);
  await resolvePredictions(orgId);
}

export async function loadPredictions(orgId: string): Promise<PredictionRow[]> {
  const { data } = await supabaseAdmin().from("predictions")
    .select("id, use_case_id, kind, claim, basis, confidence, subject_ref, subject_label, status, outcome, resolved_at, resolved_by, resolution_note, expires_at, created_at")
    .eq("org_id", orgId).order("created_at", { ascending: false }).limit(500);
  return (data ?? []) as PredictionRow[];
}
