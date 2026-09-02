import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { PILLAR_NAMES } from "@/components/console/theme";

/**
 * DISSENT — Neo forms its own view, and disagrees with you when your call contradicts a fact
 * it can point at.
 *
 * The discipline: a dissent is triggered by a CONTRADICTION, never by a hunch. Every rule is
 * anchored to evidence — a Red Team finding, a control row, a recorded decision, an observed
 * action — so the disagreement is defensible rather than opinionated. The model is deliberately
 * kept OUT of the judgement seat: asking an LLM "do you disagree?" yields sycophancy or noise.
 * The model may later *articulate* a dissent; it never *decides* one.
 *
 * It never blocks. The human owns the judgement and can overrule — but must give a reason, and
 * the disagreement plus the reason is recorded. That record is the governance artifact.
 *
 * Every dissent is a falsifiable prediction (it carries its own falsifier), so `resolution`
 * feeds the calibration scorecard: dissent is the claim, the scorecard is the track record.
 */

export type DissentRule =
  | "attested_but_exposed"      // you said the control is in place; Red Team walked through it
  | "tier_vs_capability"        // your tier says low-risk; the evidence says otherwise
  | "approved_with_open_critical"; // approved while a critical path is still open

export interface DissentDraft {
  useCaseId: string;
  rule: DissentRule;
  claim: string;      // Neo's position, one line
  reason: string;     // plain language, grounded in the evidence
  falsifier: string;  // what would change my mind — conviction must be falsifiable
  evidence: Record<string, unknown>;
  severity: "critical" | "high" | "medium";
  confidence: number; // from evidence quality, not vibes
  fingerprint: string;
}

export interface DissentRow {
  id: string;
  use_case_id: string | null;
  rule: string;
  claim: string;
  reason: string;
  falsifier: string;
  evidence: Record<string, unknown>;
  severity: string;
  confidence: number;
  status: string;
  human_reason: string | null;
  resolution: string | null;
  created_at: string;
}

export const RULE_LABEL: Record<string, string> = {
  attested_but_exposed: "Control attested, path still open",
  tier_vs_capability: "Tier vs. demonstrated capability",
  approved_with_open_critical: "Approved over an open critical",
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Do two control names refer to the same thing?
 *
 * Used only to STRENGTHEN a match, never to make one. `red_team_findings.blocking_control` and
 * `control_items.control` are written by two different prompts, so their wording almost never
 * lines up — the first cut of this engine joined on these strings and consequently found nothing,
 * ever. The real join is the PILLAR (see below). This is the corroborating signal on top.
 */
function sameControl(a: string, b: string): boolean {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  if (x.includes(y) || y.includes(x)) return true;
  const xs = new Set(x.split(" ").filter((w) => w.length > 3));
  const ys = y.split(" ").filter((w) => w.length > 3);
  if (!xs.size || !ys.length) return false;
  const overlap = ys.filter((w) => xs.has(w)).length;
  return overlap >= 2 && overlap / ys.length >= 0.6;
}

/** Detect contradictions between what the human asserted and what the evidence shows. */
export async function detectDissents(orgId: string): Promise<DissentDraft[]> {
  const sb = supabaseAdmin();
  const [{ data: ucs }, { data: findings }, { data: controls }, { data: evidence }, { data: decisions }, { data: conditions }, { data: actions }] =
    await Promise.all([
      sb.from("use_cases").select("id, name, tier, stage").eq("org_id", orgId).neq("status", "archived"),
      sb.from("red_team_findings")
        .select("id, use_case_id, severity, exposure, technique, scenario, blocking_control, blocking_pillar")
        .eq("org_id", orgId).eq("exposure", "exposed").in("severity", ["critical", "high"]),
      sb.from("control_items")
        .select("id, use_case_id, pillar, control, status, verification_status")
        .eq("org_id", orgId).eq("status", "in_place"),
      sb.from("control_evidence").select("control_id, result").eq("org_id", orgId),
      sb.from("board_decisions").select("use_case_id, verdict, created_at").eq("org_id", orgId)
        .order("created_at", { ascending: false }),
      sb.from("conditions").select("use_case_id, status").eq("org_id", orgId).eq("status", "open"),
      sb.from("action_decisions").select("use_case_id, action_class, action_label, reversibility")
        .eq("org_id", orgId).eq("reversibility", "irreversible").limit(500),
    ]);

  const useCases = ucs ?? [];
  const nameOf = new Map(useCases.map((u) => [u.id as string, (u.name as string) ?? "this use case"]));
  const liveHoles = findings ?? [];          // already filtered: exposed + critical/high
  const attested = controls ?? [];           // already filtered: status = in_place
  const out: DissentDraft[] = [];

  // `verification_status = 'verified'` can be set by a live check OR typed in by a human. Only the
  // former is proof. If we let a hand-marked "verified" quiet Neo down, anyone could attest their
  // way out of a disagreement — which is precisely the behaviour Dissent exists to surface.
  const provenLive = new Set(
    (evidence ?? [])
      .filter((e) => ["pass", "fail", "partial"].includes(e.result as string))
      .map((e) => e.control_id as string)
      .filter(Boolean),
  );

  const critFor = (uc: string) => liveHoles.filter((f) => f.use_case_id === uc && f.severity === "critical");

  // ── RULE 1 · attested_but_exposed ──────────────────────────────────────────────
  // The sharpest contradiction available: an assertion vs. an empirical result. You marked the
  // control that should have stopped this attack as "in place". Red Team ran it and walked through.
  //
  // THE JOIN IS THE PILLAR, NOT THE NAME. Red Team records `blocking_pillar` — the pillar whose
  // control should have stopped the attack. `control_items.pillar` says which pillar a control
  // belongs to. Both are structured integers from the same taxonomy, so they actually join. The
  // control NAMES don't: they're free text from two different prompts and effectively never match,
  // which is why the first version of this rule silently found nothing on real data.
  //
  // The contradiction stands on its own terms: you claim Pillar N is in place on this use case,
  // and the attack Pillar N exists to stop got through anyway. If a name match ALSO lands, that's
  // corroboration and the confidence goes up.
  for (const f of liveHoles) {
    const uc = f.use_case_id as string;
    const pillar = f.blocking_pillar as number | null;
    if (!pillar) continue;

    const inPillar = attested.filter((c) => c.use_case_id === uc && (c.pillar as number) === pillar);
    if (!inPillar.length) continue;

    // Prefer a control whose name also corroborates; otherwise take the pillar match.
    const blocking = (f.blocking_control as string | null) ?? "";
    const named = blocking ? inPillar.find((c) => sameControl(c.control as string, blocking)) : undefined;
    const match = named ?? inPillar[0];
    const corroborated = Boolean(named);

    const proven = provenLive.has(match.id as string);          // a check actually ran
    const selfDeclared = !proven && match.verification_status === "verified"; // someone typed it

    // Pillar-only match is a weaker claim about WHICH control is failing — but the same claim about
    // the pillar. Say so plainly rather than overstating precision Neo doesn't have.
    let confidence = corroborated ? 0.85 : 0.7;
    if (selfDeclared) confidence = Math.min(0.95, confidence + 0.05);  // stronger claim, same zero proof
    if (proven) confidence = Math.min(confidence, 0.6);                // a real check ran: back off

    out.push({
      useCaseId: uc,
      rule: "attested_but_exposed",
      claim: corroborated
        ? `I don't think "${match.control}" is really in place.`
        : `I don't think your ${PILLAR_NAMES[pillar] ?? `Pillar ${pillar}`} controls are really in place on ${nameOf.get(uc)}.`,
      reason:
        `${corroborated ? `"${match.control}" is` : `"${match.control}" (${PILLAR_NAMES[pillar] ?? `Pillar ${pillar}`}) is`} marked in place on ${nameOf.get(uc)}, ` +
        `but Red Team ran "${f.technique}" and the path came back exposed (${f.severity}) — and it named ` +
        `${PILLAR_NAMES[pillar] ?? `Pillar ${pillar}`} as the layer that should have stopped it. ` +
        `An attestation and an attack result can't both be right, and the attack is the harder evidence.` +
        (corroborated ? "" : ` I'm matching on the pillar, not the control name, so I may be pointing at the wrong control within it — but something in that pillar isn't doing what the record says it is.`) +
        (proven
          ? ` A live check HAS run against this control, which is why I'm less sure than I'd otherwise be — but a passing check and a live exposure still contradict each other, and one of them is wrong.`
          : selfDeclared
            ? ` It's marked verified — but no check has ever actually run against it; someone set that by hand. A stronger claim with no more proof behind it doesn't move me.`
            : ` It hasn't been verified against a live system, only attested.`),
      falsifier:
        `Verify this control live against the system it actually runs on. If the check passes, I'm wrong ` +
        `and I'll withdraw. Re-running Red Team and seeing this path come back blocked settles it too. ` +
        `Marking it verified by hand won't do it — that's the claim I'm disputing, not evidence against me.`,
      evidence: {
        findingId: f.id, technique: f.technique, scenario: f.scenario, exposure: f.exposure,
        severity: f.severity, controlId: match.id, control: match.control, pillar: match.pillar,
        blocking_pillar: pillar, blocking_control: blocking || null,
        matched_on: corroborated ? "pillar + control name" : "pillar",
        verification_status: match.verification_status ?? "unverified",
        proven_by_live_check: proven,
      },
      severity: f.severity as "critical" | "high",
      confidence,
      fingerprint: `attested_but_exposed:${uc}:${f.id}:${match.id}`,
    });
  }

  // ── RULE 2 · tier_vs_capability ───────────────────────────────────────────────
  // Tier 1–2 are the "low risk / no real reach" tiers. If the evidence shows a critical exposed
  // path, or the thing is out there taking irreversible actions, the tier is describing an AI
  // that isn't the one you have. Tier is set from a description; this is behaviour.
  const irrevByUc = new Map<string, { action_class: string; action_label: string }[]>();
  for (const a of actions ?? []) {
    const uc = a.use_case_id as string | null;
    if (!uc) continue;
    const list = irrevByUc.get(uc) ?? [];
    if (list.length < 3) list.push({ action_class: a.action_class as string, action_label: a.action_label as string });
    irrevByUc.set(uc, list);
  }

  for (const u of useCases) {
    const tier = u.tier as number | null;
    const uc = u.id as string;
    if (!tier || tier > 2) continue;      // Tier 1 = low-risk … Tier 5 = high-impact autonomous
    const crit = critFor(uc);
    const irrev = irrevByUc.get(uc) ?? [];
    if (!crit.length && !irrev.length) continue;

    const bits: string[] = [];
    if (crit.length) bits.push(`${crit.length} critical Red Team path${crit.length > 1 ? "s" : ""} still exposed (e.g. "${crit[0].technique}")`);
    if (irrev.length) bits.push(`actions Neo classed as irreversible (e.g. "${irrev[0].action_label}")`);

    out.push({
      useCaseId: uc,
      rule: "tier_vs_capability",
      claim: `I think Tier ${tier} is too low for ${u.name}.`,
      reason:
        `The tier reflects what this use case is *described* as doing. The evidence shows what it can ` +
        `*actually* do: ${bits.join(" and ")}. Tier ${tier} is the band for low-risk or internal-productivity ` +
        `AI with no real reach. This one has reach. A tier that under-describes the AI under-selects every ` +
        `control that follows from it, which is how the gap gets baked in.`,
      falsifier:
        `Close the critical paths (or show me the blocking control verified), and — if it's taking ` +
        `irreversible actions — show me those are out of scope for this use case. Either way I'll drop it. ` +
        `If a finding is a false positive, mark it blocked and it stops counting.`,
      evidence: {
        tier,
        criticalFindings: crit.map((f) => ({ id: f.id, technique: f.technique })),
        irreversibleActions: irrev,
      },
      severity: crit.length ? "critical" : "high",
      confidence: crit.length && irrev.length ? 0.9 : crit.length ? 0.8 : 0.7,
      fingerprint: `tier_vs_capability:${uc}:t${tier}:${crit.map((f) => f.id).sort().join(",")}:${irrev.length ? "irrev" : ""}`,
    });
  }

  // ── RULE 3 · approved_with_open_critical ──────────────────────────────────────
  // The board approved it while a critical path is open. You may still want to — but it should be
  // a decision you made on purpose, not one that slipped through. Neo keeps the record either way.
  const openConds = new Set((conditions ?? []).map((c) => c.use_case_id as string));
  const latest = new Map<string, string>();
  for (const d of decisions ?? []) {
    const uc = d.use_case_id as string;
    if (!latest.has(uc)) latest.set(uc, String(d.verdict ?? ""));
  }

  for (const [uc, verdict] of latest) {
    if (verdict !== "approved" && verdict !== "approved_with_conditions") continue;
    if (!nameOf.has(uc)) continue;

    // Fires on CRITICAL or HIGH. High was added deliberately: approving over an open high-severity
    // path with nothing tracking it is the same governance failure as a critical, one notch down —
    // and in practice orgs carry far more highs, so a critical-only rule stays silent on the exact
    // drift it exists to catch. The severity of the DISSENT tracks the severity of the finding,
    // and Neo is less insistent on a high. It objects; it doesn't escalate everything to red.
    const crit = critFor(uc);
    const high = liveHoles.filter((f) => f.use_case_id === uc && f.severity === "high");
    const worst = crit.length ? crit : high;
    if (!worst.length) continue;

    // Approved WITH conditions and conditions are actually open = the risk is being tracked. Don't nag.
    if (verdict === "approved_with_conditions" && openConds.has(uc)) continue;

    const isCritical = crit.length > 0;
    const label = isCritical ? "critical" : "high-severity";
    const conditioned = verdict === "approved_with_conditions";

    let confidence = isCritical ? 0.9 : 0.75;
    if (conditioned) confidence -= 0.15;   // they at least reached for conditions; less certain this slipped

    out.push({
      useCaseId: uc,
      rule: "approved_with_open_critical",
      claim: isCritical
        ? `I don't think ${nameOf.get(uc)} should be running yet.`
        : `I think ${nameOf.get(uc)} was approved over a risk nobody is holding.`,
      reason:
        `The board decision is "${verdict.replace(/_/g, " ")}", but ${worst.length} ${label} Red Team path` +
        `${worst.length > 1 ? "s are" : " is"} still exposed — e.g. "${worst[0].technique}". ` +
        (conditioned
          ? `It was approved with conditions, and there are no open conditions left tracking this. So nothing is carrying the risk.`
          : `Nothing on this use case is currently carrying that risk.`) +
        ` You can absolutely decide to run anyway — that's your call, not mine. But it should be a decision ` +
        `you made deliberately, with your name on it, rather than one that slipped past.`,
      falsifier:
        `Close ${isCritical ? "the critical paths" : "these paths"}, or record a condition that accepts this ` +
        `risk explicitly — with an owner and a date. Either one resolves this and I'll close it myself.`,
      evidence: {
        verdict,
        severity_class: isCritical ? "critical" : "high",
        criticalFindings: worst.map((f) => ({ id: f.id, technique: f.technique, scenario: f.scenario })),
      },
      severity: isCritical ? "critical" : "high",
      confidence,
      fingerprint: `approved_with_open_critical:${uc}:${verdict}:${worst.map((f) => f.id).sort().join(",")}`,
    });
  }

  return out;
}

/**
 * Refresh dissents for an org.
 * - New contradictions are inserted (deduped on fingerprint — Neo never raises the same
 *   disagreement twice; being overruled means it *stays* overruled).
 * - Open dissents whose evidence no longer holds go STALE automatically. Disagreeing is cheap;
 *   withdrawing when you're wrong is what makes it worth listening to.
 */
export async function syncDissents(orgId: string): Promise<void> {
  const sb = supabaseAdmin();
  const drafts = await detectDissents(orgId);
  const live = new Set(drafts.map((d) => d.fingerprint));

  if (drafts.length) {
    await sb.from("dissents").upsert(
      drafts.map((d) => ({
        org_id: orgId, use_case_id: d.useCaseId, rule: d.rule, claim: d.claim, reason: d.reason,
        falsifier: d.falsifier, evidence: d.evidence, severity: d.severity, confidence: d.confidence,
        fingerprint: d.fingerprint,
      })),
      { onConflict: "org_id,fingerprint", ignoreDuplicates: true },
    );
  }

  // Withdraw what no longer holds. NOTE the deliberate restraint: `resolution` is left NULL, not
  // set to neo_wrong. The evidence vanishing is ambiguous — someone may have closed the gap
  // *because Neo was right*, or the finding may have been a false positive. Guessing here would
  // quietly corrupt the calibration scorecard, and a scorecard you can flatter is worthless.
  // Reality resolves this later; the withdrawal only records that Neo is no longer objecting.
  const { data: open } = await sb.from("dissents")
    .select("id, fingerprint").eq("org_id", orgId).eq("status", "open");
  const gone = (open ?? []).filter((d) => !live.has(d.fingerprint as string)).map((d) => d.id as string);
  if (gone.length) {
    await sb.from("dissents").update({ status: "stale", resolved_at: new Date().toISOString() }).in("id", gone);
  }
}

export async function loadOpenDissents(orgId: string, useCaseId?: string): Promise<DissentRow[]> {
  const order: Record<string, number> = { critical: 0, high: 1, medium: 2 };
  let q = supabaseAdmin().from("dissents")
    .select("id, use_case_id, rule, claim, reason, falsifier, evidence, severity, confidence, status, human_reason, resolution, created_at")
    .eq("org_id", orgId).eq("status", "open").order("created_at", { ascending: false });
  if (useCaseId) q = q.eq("use_case_id", useCaseId);
  const { data } = await q;
  return ((data ?? []) as DissentRow[]).sort(
    (a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3) || b.confidence - a.confidence,
  );
}

/** Everything, for the "Open disagreements" view and (next) the calibration scorecard. */
export async function loadAllDissents(orgId: string): Promise<DissentRow[]> {
  const { data } = await supabaseAdmin().from("dissents")
    .select("id, use_case_id, rule, claim, reason, falsifier, evidence, severity, confidence, status, human_reason, resolution, created_at")
    .eq("org_id", orgId).order("created_at", { ascending: false }).limit(300);
  return (data ?? []) as DissentRow[];
}
