import { auth } from "@clerk/nextjs/server";
import { getAuthContext } from "@/server/identity/auth-context";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ensureOrg } from "@/lib/org";
import { supabaseAdmin } from "@/lib/supabase";
import { syncCalibration, loadPredictions, KIND_LABEL } from "@/server/calibration/predict";
import { learnRates, learningSummary, MIN_N_TO_ADJUST } from "@/server/calibration/learn";
import { scoreCalibration, verdictLine, MIN_N, type Scored } from "@/lib/calibration";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

/**
 * NEO'S TRACK RECORD.
 *
 * Every other AI product asks you to trust its confidence numbers. This page is Neo showing its
 * working: what it committed to before the fact, what actually happened, and how often it was
 * right at each confidence level.
 *
 * The rule that makes it worth anything: predictions resolve against events the system produces on
 * its own — a live verification check, a Red Team run, a clock — never against a human agreeing
 * with Neo. A model scored on human agreement learns to flatter. This one can't.
 *
 * And when there isn't enough data, it says so rather than drawing a confident-looking curve over
 * four data points. That refusal is the feature.
 */
export default async function CalibrationPage() {
  const { orgId } = await getAuthContext();
  if (!orgId) return <p className="text-[var(--muted)]">Select an organization first.</p>;
  const internalOrgId = (await getAuthContext()).internalOrgId as string;

  const { data: org } = await supabaseAdmin()
    .from("organizations").select("is_demo").eq("id", internalOrgId).single();
  if (!org?.is_demo) notFound();

  try { await syncCalibration(internalOrgId); } catch (e) { console.error("CALIBRATION SYNC", e); }
  const all = await loadPredictions(internalOrgId);
  const learning = learningSummary(await learnRates(internalOrgId));

  const resolved = all.filter((p) => p.status === "resolved" && p.outcome);
  const open = all.filter((p) => p.status === "open");
  const scored: Scored[] = resolved.map((p) => ({
    kind: p.kind, confidence: Number(p.confidence), correct: p.outcome === "correct",
  }));
  const s = scoreCalibration(scored);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-xl font-bold text-[var(--text)]">{BRAND.name}&rsquo;s Track Record</h1>
      <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[var(--muted)]">
        {BRAND.name} commits to falsifiable claims <em>before</em> the answer exists — this control will fail
        when you check it, this path will still be open at your next run — and then your systems settle
        them. Not a human agreeing with {BRAND.name}: a check that ran, a run that happened, a clock that expired.
        Everything below is scored that way, including the times it was wrong.
      </p>

      {/* The headline — or the honest refusal to give one. */}
      <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5">
        <p className="text-[15px] font-medium leading-relaxed text-[var(--text)]">{verdictLine(s)}</p>
        {s.enough && (
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Settled predictions" value={String(s.n)} />
            <Stat label="Right" value={`${Math.round((s.accuracy ?? 0) * 100)}%`} />
            <Stat
              label="Brier score"
              value={(s.brier ?? 0).toFixed(3)}
              hint="0 = perfect, 0.25 = a coin flip. Measures the probability, not just the call."
            />
            <Stat
              label="Confidence gap"
              value={`${(s.overconfident ?? 0) >= 0 ? "+" : ""}${Math.round((s.overconfident ?? 0) * 100)} pts`}
              hint={`What ${BRAND.name} claimed minus what it delivered. Positive = talks bigger than it performs.`}
            />
          </div>
        )}
      </div>

      {/* The reliability curve — the only chart that matters here. */}
      {s.buckets.length > 0 && (
        <section className="mt-7">
          <h2 className="text-[13px] font-bold uppercase tracking-wide text-[var(--faint)]">
            When {BRAND.name} says X, how often is it right?
          </h2>
          <p className="mt-1 text-[12px] text-[var(--muted)]">
            A well-calibrated system tracks the diagonal: the bar should land near the number it claimed.
            Bar short of the claim = overconfident. Bar past it = underselling.
          </p>
          <div className="mt-3 space-y-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
            {s.buckets.map((b) => {
              const claimed = Math.round(b.claimed * 100);
              const actual = Math.round(b.actual * 100);
              const gap = actual - claimed;
              const color = Math.abs(gap) <= 10 ? "#22c55e" : gap < 0 ? "#ef4444" : "#3b82f6";
              return (
                <div key={b.label}>
                  <div className="flex items-baseline justify-between text-[12px]">
                    <span className="font-semibold text-[var(--text)]">
                      Said {b.label} <span className="font-normal text-[var(--faint)]">· {b.n} prediction{b.n === 1 ? "" : "s"}</span>
                    </span>
                    <span style={{ color }}>
                      right {actual}% of the time
                      {Math.abs(gap) > 10 && (gap < 0 ? " — overconfident" : " — underselling")}
                    </span>
                  </div>
                  <div className="relative mt-1 h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface)]">
                    <div className="h-full rounded-full" style={{ width: `${actual}%`, background: color }} />
                    {/* the claim, as a line to be judged against */}
                    <div className="absolute top-0 h-full w-px bg-[var(--text)] opacity-70" style={{ left: `${claimed}%` }} />
                  </div>
                </div>
              );
            })}
            <p className="pt-1 text-[11px] text-[var(--faint)]">
              The vertical line is what {BRAND.name} claimed. The bar is what happened.
            </p>
          </div>
        </section>
      )}

      {/* WHAT NEO HAS LEARNED. The loop, made visible — a model that adjusts itself in ways nobody
          can inspect is not trustworthy, however accurate it becomes. */}
      <section className="mt-7">
        <h2 className="text-[13px] font-bold uppercase tracking-wide text-[var(--faint)]">
          What {BRAND.name} has learned about itself
        </h2>
        {learning.active.length === 0 ? (
          <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5 text-[13px] leading-relaxed text-[var(--muted)]">
            Nothing yet. {BRAND.name}&rsquo;s confidence numbers today are <em>priors</em> — reasoned, but unearned.
            Once {MIN_N_TO_ADJUST}+ predictions of a given kind have been settled by your systems, {BRAND.name}
            re-derives that number from what actually happened and starts speaking with it instead. Every
            adjustment will be listed here, with the evidence behind it.
            {learning.waiting.length > 0 && (
              <span className="mt-2 block text-[var(--faint)]">
                Closest: {learning.waiting[0].n}/{MIN_N_TO_ADJUST} settled on{" "}
                {KIND_LABEL[learning.waiting[0].kind] ?? learning.waiting[0].kind}.
              </span>
            )}
          </div>
        ) : (
          <div className="mt-2 overflow-hidden rounded-xl border border-[var(--border)]">
            <table className="w-full text-left text-[12.5px]">
              <thead className="bg-[var(--surface)] text-[11px] uppercase tracking-wide text-[var(--faint)]">
                <tr>
                  <th className="px-3 py-2 font-semibold">On claims like</th>
                  <th className="px-3 py-2 font-semibold">{BRAND.name} used to say</th>
                  <th className="px-3 py-2 font-semibold">It now says</th>
                  <th className="px-3 py-2 font-semibold">Because</th>
                </tr>
              </thead>
              <tbody>
                {learning.active.map((r) => {
                  const moved = r.learned - r.prior;
                  const color = Math.abs(moved) < 0.02 ? "var(--muted)" : moved < 0 ? "#f59e0b" : "#22c55e";
                  return (
                    <tr key={`${r.kind}:${r.band}`} className="border-t border-[var(--border)] bg-[var(--panel)]">
                      <td className="px-3 py-2.5 text-[var(--text)]">{KIND_LABEL[r.kind] ?? r.kind}</td>
                      <td className="px-3 py-2.5 text-[var(--muted)]">{Math.round(r.prior * 100)}%</td>
                      <td className="px-3 py-2.5 font-semibold" style={{ color }}>
                        {Math.round(r.learned * 100)}%
                        {Math.abs(moved) >= 0.02 && (
                          <span className="ml-1 text-[11px] font-normal">
                            ({moved > 0 ? "+" : ""}{Math.round(moved * 100)})
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-[var(--muted)]">
                        it was right {r.correct} of {r.n} times
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="border-t border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-[11px] leading-relaxed text-[var(--faint)]">
              Smoothed toward the prior, so a handful of results can&rsquo;t swing {BRAND.name}&rsquo;s voice — it moves
              only as fast as the evidence accumulates. Learned <em>only</em> from predictions your systems
              settled; a human agreeing with {BRAND.name} never trains it, because a model rewarded for agreement
              learns to flatter.
            </p>
          </div>
        )}
      </section>

      {/* Per-kind — where is it actually good, and where is it not? */}
      {s.byKind.length > 0 && (
        <section className="mt-7">
          <h2 className="text-[13px] font-bold uppercase tracking-wide text-[var(--faint)]">By kind of claim</h2>
          <div className="mt-2 overflow-hidden rounded-xl border border-[var(--border)]">
            <table className="w-full text-left text-[12.5px]">
              <thead className="bg-[var(--surface)] text-[11px] uppercase tracking-wide text-[var(--faint)]">
                <tr>
                  <th className="px-3 py-2 font-semibold">Claim</th>
                  <th className="px-3 py-2 font-semibold">Settled</th>
                  <th className="px-3 py-2 font-semibold">Right</th>
                </tr>
              </thead>
              <tbody>
                {s.byKind.map((k) => (
                  <tr key={k.kind} className="border-t border-[var(--border)] bg-[var(--panel)]">
                    <td className="px-3 py-2.5 text-[var(--text)]">{KIND_LABEL[k.kind] ?? k.kind}</td>
                    <td className="px-3 py-2.5 text-[var(--muted)]">{k.n}</td>
                    <td className="px-3 py-2.5 text-[var(--muted)]">
                      {k.correct}/{k.n}
                      {k.n >= 5 && <span className="ml-1 text-[var(--faint)]">({Math.round((k.accuracy ?? 0) * 100)}%)</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Open bets — the ones Neo has made and cannot take back. */}
      <section className="mt-7">
        <h2 className="text-[13px] font-bold uppercase tracking-wide text-[var(--faint)]">
          On the record, not yet settled ({open.length})
        </h2>
        <p className="mt-1 text-[12px] text-[var(--muted)]">
          {BRAND.name} has committed to these. It cannot revise them — they resolve when your systems answer.
        </p>
        {open.length === 0 ? (
          <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5 text-[13px] text-[var(--muted)]">
            Nothing outstanding. {BRAND.name} makes predictions off attested-but-unverified controls and open Red
            Team paths — if there are none, there's nothing honest to bet on.
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            {open.slice(0, 25).map((p) => (
              <div key={p.id} className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3.5">
                <div className="flex items-baseline gap-2">
                  <span className="shrink-0 rounded bg-[#3b82f61a] px-1.5 py-0.5 text-[11px] font-bold text-[#3b82f6]">
                    {Math.round(Number(p.confidence) * 100)}%
                  </span>
                  <p className="text-[13px] font-medium text-[var(--text)]">{p.claim}</p>
                </div>
                <p className="mt-1 pl-1 text-[12px] leading-relaxed text-[var(--muted)]">{p.basis}</p>
                {p.use_case_id && (
                  <Link href={`/dashboard/use-cases/${p.use_case_id}`} className="mt-1 inline-block pl-1 text-[11.5px] font-semibold text-[#3b82f6] hover:underline">
                    Open the use case →
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Settled — including, prominently, the misses. */}
      {resolved.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[13px] font-bold uppercase tracking-wide text-[var(--faint)]">Settled</h2>
          <div className="mt-2 overflow-hidden rounded-xl border border-[var(--border)]">
            <table className="w-full text-left text-[12.5px]">
              <thead className="bg-[var(--surface)] text-[11px] uppercase tracking-wide text-[var(--faint)]">
                <tr>
                  <th className="px-3 py-2 font-semibold">{BRAND.name} said</th>
                  <th className="px-3 py-2 font-semibold">Sure</th>
                  <th className="px-3 py-2 font-semibold">What happened</th>
                  <th className="px-3 py-2 font-semibold">Settled by</th>
                </tr>
              </thead>
              <tbody>
                {resolved.slice(0, 50).map((p) => (
                  <tr key={p.id} className="border-t border-[var(--border)] bg-[var(--panel)] align-top">
                    <td className="px-3 py-2.5 text-[var(--text)]">{p.claim}</td>
                    <td className="px-3 py-2.5 text-[var(--muted)]">{Math.round(Number(p.confidence) * 100)}%</td>
                    <td className="px-3 py-2.5">
                      <span
                        className="rounded px-1.5 py-0.5 text-[11px] font-semibold"
                        style={
                          p.outcome === "correct"
                            ? { background: "#22c55e1f", color: "#22c55e" }
                            : { background: "#ef44441f", color: "#ef4444" }
                        }
                      >
                        {p.outcome === "correct" ? `${BRAND.name} was right` : `${BRAND.name} was wrong`}
                      </span>
                      {p.resolution_note && (
                        <p className="mt-1 text-[11.5px] text-[var(--muted)]">{p.resolution_note}</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--faint)]">{p.resolved_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="mt-6 text-[11.5px] leading-relaxed text-[var(--faint)]">
        Honest scope: the confidence numbers {BRAND.name} states today are <em>priors</em> — reasoned, but not yet
        earned. Once {MIN_N}+ predictions have settled, they get re-derived from what actually happened, per
        kind and per confidence band, so {BRAND.name} stops asserting how sure it is and starts knowing. Nothing here
        is scored on a human agreeing with {BRAND.name}, and self-attestation is never accepted as proof it was right.
      </p>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-[var(--faint)]">{label}</p>
      <p className="mt-0.5 text-2xl font-bold text-[var(--text)]">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] leading-snug text-[var(--faint)]">{hint}</p>}
    </div>
  );
}
