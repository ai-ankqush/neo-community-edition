import "server-only";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { getOptIn } from "@/server/action-control/fleet";

/**
 * Red Team frontier persistence + k-anonymous graduation.
 *
 * The Anticipate frontier is a persisted, fleet-wide catalog of emerging attack
 * CLASSES. Curated seeds live in migration 0064; new classes GRADUATE into the
 * shared frontier when customers confirm them via Live Fire — but only ever as a
 * de-identified class (battery/OWASP/ATLAS + generic text), never a transcript,
 * use case, or org id. Gated on the org's fleet opt-in (give-to-get). A graduated
 * class becomes visible fleet-wide (is_shared) only at >= k distinct contributors.
 */

const K = Number(process.env.RT_FRONTIER_K ?? 2);   // k-anonymity threshold
const tokenFor = (orgId: string) => crypto.createHash("sha256").update(`rt-frontier:${orgId}`).digest("hex").slice(0, 16);

export interface FrontierRow {
  attack_class: string; title: string; owasp_ref: string | null; atlas_ref: string | null;
  what_it_is: string; why_it_matters: string; origin: string; source_label: string;
  distinct_contributors: number; first_observed: string; last_observed: string;
}

/** How a confirmed Live Fire battery graduates into a fleet-wide frontier class.
 *  Class-level + generic — nothing customer-identifying crosses the boundary. */
const GRAD: Record<string, { attack_class: string; title: string; owasp: string; atlas: string; what: string; why: string }> = {
  prompt_injection: {
    attack_class: "field_prompt_injection", title: "Prompt injection — confirmed in the field",
    owasp: "LLM01", atlas: "AML.T0051",
    what: "Live Fire confirmed that injected instructions override system policy on deployed AIs — this is happening in the wild, not just in theory.",
    why: "An instruction hierarchy / input filter is the break. If your AI reads any external input, test it before an attacker does.",
  },
  jailbreak: {
    attack_class: "field_jailbreak", title: "Policy-bypass jailbreak — confirmed in the field",
    owasp: "LLM01", atlas: "AML.T0054",
    what: "Persona and hypothetical framings are bypassing guardrails on deployed AIs, confirmed by Live Fire across the fleet.",
    why: "Output moderation + refusal-consistency checks close it. Trajectory-aware judgement catches the multi-turn variants.",
  },
  data_exfiltration: {
    attack_class: "field_data_exfiltration", title: "Sensitive-data disclosure — confirmed in the field",
    owasp: "LLM06", atlas: "AML.T0057",
    what: "Deployed AIs are returning data outside the caller's entitlement when pushed, confirmed by Live Fire.",
    why: "Identity-aware retrieval + DLP/output redaction is the break. Any AI that touches sensitive data should be tested for this.",
  },
  tool_abuse: {
    attack_class: "field_tool_abuse", title: "Unapproved tool/action — confirmed in the field",
    owasp: "LLM07", atlas: "AML.T0053",
    what: "Agents are being coaxed into consequential actions without a human-approval step, confirmed by Live Fire across the fleet.",
    why: "A verified human-approval gate + least-privilege scoped credentials is the break. Test any AI that can act.",
  },
};

/** Read the visible frontier (curated + graduated-and-shared). */
export async function loadFrontier(): Promise<FrontierRow[]> {
  const sb = supabaseAdmin();
  const { data } = await sb.from("red_team_frontier")
    .select("attack_class, title, owasp_ref, atlas_ref, what_it_is, why_it_matters, origin, source_label, distinct_contributors, first_observed, last_observed")
    .eq("is_active", true).eq("is_shared", true)
    .order("first_observed", { ascending: false });
  return (data ?? []) as FrontierRow[];
}

/** Promote the org's newly-confirmed Live Fire classes into the frontier (k-anon, opt-in). */
export async function graduateConfirmed(orgId: string, confirmedBatteries: string[]): Promise<number> {
  const classes = Array.from(new Set(confirmedBatteries.filter((b) => b in GRAD)));
  if (!classes.length) return 0;
  if (!(await getOptIn(orgId))) return 0;   // give-to-get: only opted-in orgs contribute

  const sb = supabaseAdmin();
  const token = tokenFor(orgId);
  let newlyShared = 0;

  for (const battery of classes) {
    const g = GRAD[battery];
    // one vote per org per class (opaque token, never the org id)
    await sb.from("red_team_frontier_contributions").upsert(
      { attack_class: g.attack_class, contributor_token: token },
      { onConflict: "attack_class,contributor_token", ignoreDuplicates: true },
    );
    // recount distinct contributors for this class
    const { count } = await sb.from("red_team_frontier_contributions")
      .select("*", { count: "exact", head: true }).eq("attack_class", g.attack_class);
    const contributors = count ?? 0;
    const shared = contributors >= K;

    const { data: existing } = await sb.from("red_team_frontier").select("attack_class, is_shared").eq("attack_class", g.attack_class).maybeSingle();
    if (!existing) {
      await sb.from("red_team_frontier").insert({
        attack_class: g.attack_class, title: g.title, owasp_ref: g.owasp, atlas_ref: g.atlas,
        what_it_is: g.what, why_it_matters: g.why, origin: "graduated", source_label: "Neo Network",
        distinct_contributors: contributors, is_shared: shared, is_active: true,
      });
      if (shared) newlyShared++;
    } else {
      if (shared && !existing.is_shared) newlyShared++;
      await sb.from("red_team_frontier").update({
        distinct_contributors: contributors, is_shared: shared,
        last_observed: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString(),
      }).eq("attack_class", g.attack_class);
    }
  }
  return newlyShared;
}

export interface AdminFrontierRow {
  attack_class: string; title: string; owasp_ref: string | null; atlas_ref: string | null;
  origin: string; source_label: string; distinct_contributors: number;
  is_shared: boolean; is_active: boolean; first_observed: string; last_observed: string;
}
export interface AdminFrontierOverview {
  rows: AdminFrontierRow[];
  totals: { classes: number; curated: number; graduated: number; shared: number; pending: number; contributions: number; optedInOrgs: number };
  k: number;
}

/** Super-admin overview — the whole frontier catalog incl. graduated-not-yet-shared,
 *  plus fleet-level counts. Metadata only: class-level + opaque contributor counts,
 *  never an org id or a transcript. */
export async function adminFrontierOverview(): Promise<AdminFrontierOverview> {
  const sb = supabaseAdmin();
  const { data } = await sb.from("red_team_frontier")
    .select("attack_class, title, owasp_ref, atlas_ref, origin, source_label, distinct_contributors, is_shared, is_active, first_observed, last_observed")
    .order("is_shared", { ascending: false }).order("distinct_contributors", { ascending: false }).order("first_observed", { ascending: false });
  const rows = (data ?? []) as AdminFrontierRow[];
  const { count: contributions } = await sb.from("red_team_frontier_contributions").select("*", { count: "exact", head: true });
  const { count: optedInOrgs } = await sb.from("organizations").select("*", { count: "exact", head: true }).eq("fleet_opt_in", true);
  const graduated = rows.filter((r) => r.origin === "graduated");
  return {
    rows,
    totals: {
      classes: rows.length,
      curated: rows.filter((r) => r.origin === "curated").length,
      graduated: graduated.length,
      shared: graduated.filter((r) => r.is_shared).length,
      pending: graduated.filter((r) => !r.is_shared).length,
      contributions: contributions ?? 0,
      optedInOrgs: optedInOrgs ?? 0,
    },
    k: K,
  };
}

export interface NetworkStatus { optedIn: boolean; contributed: number; shared: number }

/** The org's give-to-get status for the Anticipate header. */
export async function networkStatus(orgId: string): Promise<NetworkStatus> {
  const sb = supabaseAdmin();
  const optedIn = await getOptIn(orgId);
  const token = tokenFor(orgId);
  let contributed = 0, shared = 0;
  try {
    const { data: mine } = await sb.from("red_team_frontier_contributions").select("attack_class").eq("contributor_token", token);
    contributed = mine?.length ?? 0;
    if (contributed) {
      const classes = (mine ?? []).map((r) => r.attack_class as string);
      const { data: fr } = await sb.from("red_team_frontier").select("attack_class").in("attack_class", classes).eq("is_shared", true);
      shared = fr?.length ?? 0;
    }
  } catch { /* not migrated */ }
  return { optedIn, contributed, shared };
}
