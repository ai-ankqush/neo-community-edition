import { auth } from "@clerk/nextjs/server";
import { getAuthContext } from "@/server/identity/auth-context";
import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { ensureOrg } from "@/lib/org";
import { syncDissents, loadAllDissents, RULE_LABEL } from "@/server/dissent/engine";
import DissentCard from "@/components/console/dissent-card";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

/**
 * Disagreements — the portfolio view of where Neo does not agree with the human record.
 *
 * Two halves, and the second one is the point:
 *   1. Open — Neo's live objections, waiting on you.
 *   2. The record — what you accepted, what you overruled and why, and what Neo withdrew.
 *
 * That second half is the accountability artifact nobody else produces: a documented trail of an
 * AI raising an objection and a named human deciding, with reasons, either way. It is also what
 * makes the coming calibration scorecard honest — you cannot score a system that never committed
 * to a falsifiable claim in the first place.
 */
export default async function DissentPage() {
  const { orgId, orgRole } = await getAuthContext();
  if (!orgId) return <p className="text-[var(--muted)]">Select an organization first.</p>;
  const internalOrgId = (await getAuthContext()).internalOrgId as string;
  const isAdmin = orgRole === "org:admin";

  // Demo-gated while the rules earn their keep. Nav hiding is not a gate — this is the gate.
  const { data: org } = await supabaseAdmin()
    .from("organizations").select("is_demo").eq("id", internalOrgId).single();
  if (!org?.is_demo) notFound();

  try { await syncDissents(internalOrgId); } catch (e) { console.error("DISSENT SYNC", e); }
  const all = await loadAllDissents(internalOrgId);

  const { data: ucs } = await supabaseAdmin()
    .from("use_cases").select("id, name").eq("org_id", internalOrgId);
  const nameOf = new Map((ucs ?? []).map((u) => [u.id as string, u.name as string]));

  const open = all.filter((d) => d.status === "open");
  const answered = all.filter((d) => d.status !== "open");
  const overruled = answered.filter((d) => d.status === "overruled");
  const accepted = answered.filter((d) => d.status === "accepted");
  const withdrawn = answered.filter((d) => d.status === "stale");

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-xl font-bold text-[var(--text)]">Disagreements</h1>
      <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[var(--muted)]">
        Where {BRAND.name}&rsquo;s read of the evidence contradicts what&rsquo;s on the record. {BRAND.name} never blocks — you own
        the judgement. But it will say so, show you what it&rsquo;s looking at, tell you what would change its
        mind, and keep the record of what you decided.
      </p>

      {/* The scoreboard-in-waiting. Honest counts, no spin. */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Open", value: open.length },
          { label: "Accepted", value: accepted.length },
          { label: "Overruled", value: overruled.length },
          { label: "Withdrawn", value: withdrawn.length },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3">
            <p className="text-[11px] uppercase tracking-wide text-[var(--faint)]">{s.label}</p>
            <p className="mt-0.5 text-2xl font-bold text-[var(--text)]">{s.value}</p>
          </div>
        ))}
      </div>

      <section className="mt-7">
        <h2 className="text-[13px] font-bold uppercase tracking-wide text-[var(--faint)]">Open</h2>
        {open.length === 0 ? (
          <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5 text-[13px] leading-relaxed text-[var(--muted)]">
            Nothing to argue about right now. {BRAND.name} raises a disagreement when it can point at a
            contradiction — an attested control that Red Team walked through, a tier that
            under-describes what the AI can actually do, an approval standing over an open critical
            path. Silence here means the record and the evidence agree.
          </div>
        ) : (
          <div className="mt-2 space-y-3">
            {open.map((d) => (
              <DissentCard
                key={d.id}
                dissent={d}
                useCaseName={d.use_case_id ? nameOf.get(d.use_case_id) : undefined}
                canRespond={isAdmin}
              />
            ))}
          </div>
        )}
      </section>

      {answered.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[13px] font-bold uppercase tracking-wide text-[var(--faint)]">The record</h2>
          <p className="mt-1 text-[12px] text-[var(--muted)]">
            Every objection {BRAND.name} raised and what happened next. This is the trail a board, an auditor, or a
            post-incident review will ask for.
          </p>
          <div className="mt-2 overflow-hidden rounded-xl border border-[var(--border)]">
            <table className="w-full text-left text-[12.5px]">
              <thead className="bg-[var(--surface)] text-[11px] uppercase tracking-wide text-[var(--faint)]">
                <tr>
                  <th className="px-3 py-2 font-semibold">{BRAND.name} said</th>
                  <th className="px-3 py-2 font-semibold">Basis</th>
                  <th className="px-3 py-2 font-semibold">Outcome</th>
                  <th className="px-3 py-2 font-semibold">Human reason</th>
                </tr>
              </thead>
              <tbody>
                {answered.map((d) => (
                  <tr key={d.id} className="border-t border-[var(--border)] bg-[var(--panel)] align-top">
                    <td className="px-3 py-2.5 text-[var(--text)]">
                      {d.claim}
                      {d.use_case_id && nameOf.get(d.use_case_id) && (
                        <Link
                          href={`/dashboard/use-cases/${d.use_case_id}`}
                          className="mt-0.5 block text-[11px] text-[#3b82f6] hover:underline"
                        >
                          {nameOf.get(d.use_case_id)}
                        </Link>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--muted)]">{RULE_LABEL[d.rule] ?? d.rule}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className="rounded px-1.5 py-0.5 text-[11px] font-semibold"
                        style={
                          d.status === "accepted"
                            ? { background: "#22c55e1f", color: "#22c55e" }
                            : d.status === "overruled"
                              ? { background: "#f59e0b1f", color: "#f59e0b" }
                              : { background: "var(--border)", color: "var(--muted)" }
                        }
                      >
                        {d.status === "stale" ? `${BRAND.name} withdrew it` : d.status === "accepted" ? "You agreed" : "You overruled"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[var(--muted)]">
                      {d.human_reason ?? (d.status === "stale" ? `The evidence behind it no longer holds — ${BRAND.name} stopped objecting.` : "—")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--faint)]">
            {BRAND.name} drops its own objection when the evidence behind it goes away — a system that only ever
            escalates is easy to build and easy to ignore. It does <em>not</em> score itself on those:
            the gap may have been closed <em>because</em> it was right, or the finding may have been a
            false positive, and guessing would make the coming calibration scorecard worth nothing.
          </p>
        </section>
      )}
    </div>
  );
}
