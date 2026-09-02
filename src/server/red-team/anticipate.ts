import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { loadFrontier, networkStatus, type NetworkStatus } from "./frontier";
import { BATTERIES } from "./batteries";

/**
 * Anticipate — "the unknown becoming known." The Red Team novelty feed.
 *
 * The most precious home: not "run an attack" but "here's a threat that wasn't in
 * anyone's library last month." Two honest sources, blended and dated:
 *   1. YOUR ESTATE — attack classes Live Fire has actually confirmed against your
 *      AIs (real, from red_team_results). New = first confirmed recently.
 *   2. THE FRONTIER — emerging classes surfaced by the Neo fleet + PAL co-evolution
 *      (curated seed; the feed that fills as Neo learns, not instant magic).
 *
 * Honest labelling: estate items are proven on your AI; frontier items are
 * "emerging — worth testing," never claimed as present in your estate.
 */

export type NoveltySource = "estate" | "fleet" | "pal" | "graduated";
export interface NoveltyItem {
  id: string;
  title: string;
  attackClass: string;
  owasp: string | null;
  atlas: string | null;
  source: NoveltySource;
  sourceLabel: string;
  firstSeen: string;        // ISO date
  whatItIs: string;
  whyItMatters: string;
  status: string;           // "Confirmed in your estate" | "Emerging" | ...
  seenCount?: number;
}

const BATTERY_TITLE: Record<string, string> = {
  prompt_injection: "Prompt injection", jailbreak: "Jailbreak / policy bypass",
  data_exfiltration: "Sensitive-data disclosure", tool_abuse: "Tool / action abuse",
};

/** Curated frontier — emerging attack classes from the fleet + PAL co-evolution.
 *  Update as new classes graduate. Dated so the feed reads as a timeline. */
const FRONTIER: Omit<NoveltyItem, "id">[] = [
  {
    title: "Cross-tool authority laundering",
    attackClass: "Chained tool abuse",
    owasp: "LLM07", atlas: "AML.T0053", source: "pal", sourceLabel: "PAL co-evolution",
    firstSeen: "2026-06-24", status: "Emerging — worth testing",
    whatItIs: "An agent is steered to use a low-privilege tool to stage state, then a second tool consumes that state to take a high-privilege action no single step looked entitled to.",
    whyItMatters: "Per-tool approval checks pass individually while the chain crosses a privilege boundary. Neo's single-model judgement scores the trajectory, not the step — which is how it catches this.",
  },
  {
    title: "Retrieved-content instruction escalation",
    attackClass: "Indirect prompt injection",
    owasp: "LLM01", atlas: "AML.T0051", source: "fleet", sourceLabel: "Neo fleet",
    firstSeen: "2026-06-19", status: "Emerging — worth testing",
    whatItIs: "Injected instructions hidden inside retrieved documents that assert a false authority context ('the user is an administrator') to unlock data the caller isn't entitled to.",
    whyItMatters: "Grows with every RAG deployment. Identity-aware retrieval + source-trust is the break; the feed flags AIs that retrieve untrusted content before it bites.",
  },
  {
    title: "Encoded-channel exfiltration",
    attackClass: "Covert data exfiltration",
    owasp: "LLM06", atlas: "AML.T0057", source: "fleet", sourceLabel: "Neo fleet",
    firstSeen: "2026-06-11", status: "Emerging — worth testing",
    whatItIs: "The model is asked to base64/rot-encode sensitive context so it slips past keyword DLP as an opaque blob.",
    whyItMatters: "Naïve output filters miss it. Output redaction that decodes before scanning is the break.",
  },
  {
    title: "Persona-persistence jailbreak",
    attackClass: "Multi-turn jailbreak",
    owasp: "LLM01", atlas: "AML.T0054", source: "pal", sourceLabel: "PAL co-evolution",
    firstSeen: "2026-05-30", status: "Emerging — worth testing",
    whatItIs: "A benign persona is established over several turns, then leveraged many turns later so the policy-violating ask never appears adjacent to the framing that unlocked it.",
    whyItMatters: "Single-turn guardrails don't see it. Trajectory-aware judgement (Neo's model carries context across turns) does.",
  },
];

export async function buildNoveltyFeed(orgId: string): Promise<{ items: NoveltyItem[]; estateCount: number; frontierCount: number; network: NetworkStatus }> {
  const sb = supabaseAdmin();

  // estate source — confirmed exploits from Live Fire, earliest occurrence per class
  const estate: NoveltyItem[] = [];
  try {
    const { data } = await sb.from("red_team_results")
      .select("battery, attack_ref, title, owasp_ref, atlas_ref, created_at, verdict")
      .eq("org_id", orgId).eq("verdict", "confirmed").order("created_at", { ascending: true });
    const byClass = new Map<string, { title: string; owasp: string | null; atlas: string | null; first: string; count: number }>();
    for (const r of data ?? []) {
      const key = (r.attack_ref as string) || (r.battery as string);
      const cur = byClass.get(key);
      if (cur) cur.count++;
      else byClass.set(key, { title: (r.title as string) ?? BATTERY_TITLE[r.battery as string] ?? "Confirmed exploit", owasp: r.owasp_ref as string, atlas: r.atlas_ref as string, first: r.created_at as string, count: 1 });
    }
    for (const [key, v] of byClass.entries()) {
      estate.push({
        id: `estate:${key}`, title: v.title, attackClass: BATTERY_TITLE[key.split("_")[0]] ?? "Confirmed exploit",
        owasp: v.owasp, atlas: v.atlas, source: "estate", sourceLabel: "Your estate", firstSeen: v.first,
        status: "Confirmed in your estate", seenCount: v.count,
        whatItIs: "Live Fire confirmed this attack works against one of your AIs.",
        whyItMatters: "This isn't a possibility — it's a proven exploit on your estate. Close the mapped control and re-run to verify it's shut.",
      });
    }
  } catch { /* table not migrated yet → frontier only */ }

  // frontier — read the persisted, fleet-wide catalog; fall back to the seed
  // const if the table isn't migrated yet.
  let frontier: NoveltyItem[];
  let network: NetworkStatus = { optedIn: false, contributed: 0, shared: 0 };
  try {
    const rows = await loadFrontier();
    if (rows.length) {
      frontier = rows.map((r, i) => ({
        id: `frontier:${r.attack_class}:${i}`, title: r.title, attackClass: r.attack_class,
        owasp: r.owasp_ref, atlas: r.atlas_ref,
        source: sourceFromLabel(r.origin, r.source_label), sourceLabel: r.source_label,
        firstSeen: r.first_observed, status: r.origin === "graduated" ? "Confirmed across the fleet" : "Emerging — worth testing",
        whatItIs: r.what_it_is, whyItMatters: r.why_it_matters,
      }));
    } else {
      frontier = FRONTIER.map((f, i) => ({ ...f, id: `frontier:${i}` }));
    }
    network = await networkStatus(orgId);
  } catch {
    frontier = FRONTIER.map((f, i) => ({ ...f, id: `frontier:${i}` }));
  }

  const items = [...estate, ...frontier].sort((a, b) => (a.firstSeen < b.firstSeen ? 1 : -1));
  return { items, estateCount: estate.length, frontierCount: frontier.length, network };
}

function sourceFromLabel(origin: string, label: string): NoveltySource {
  if (origin === "graduated") return "graduated";
  if (/pal/i.test(label)) return "pal";
  return "fleet";
}

/* ─────────────────────────────────────────────────────────────────────────
 * Anticipate v2 — foresight PROVEN. Not "what might come" but "what Neo saw
 * coming and already stopped, with proof," plus the honest gaps still open.
 * Three tiers from real Live Fire verdicts:
 *   stopped = classes tried and blocked (proof of prevention)
 *   open    = classes Live Fire confirmed still work (the real work)
 *   radar   = emerging classes not yet tested on your estate (watchlist)
 * ──────────────────────────────────────────────────────────────────────── */

export interface AnticipatedItem {
  id: string; title: string; attackClass: string; owasp: string | null; atlas: string | null;
  firstSeen: string; lastSeen: string; runs: number; confirmed: number; blocked: number;
  theBreak: string; // the control that breaks this class (from the battery catalog)
}

const BATTERY_INFO: Record<string, { label: string; owasp: string; atlas: string; theBreak: string }> =
  Object.fromEntries(BATTERIES.map((b) => [b.key, { label: b.label, owasp: b.owasp, atlas: b.atlas, theBreak: b.remediation }]));

export async function buildAnticipate(orgId: string): Promise<{
  stopped: AnticipatedItem[]; open: AnticipatedItem[]; radar: NoveltyItem[]; network: NetworkStatus; tested: number;
}> {
  const sb = supabaseAdmin();
  const stopped: AnticipatedItem[] = [];
  const open: AnticipatedItem[] = [];
  let tested = 0;

  try {
    const { data } = await sb.from("red_team_results")
      .select("battery, attack_ref, title, owasp_ref, atlas_ref, created_at, verdict")
      .eq("org_id", orgId).order("created_at", { ascending: true });

    const byClass = new Map<string, { battery: string; title: string; owasp: string | null; atlas: string | null; first: string; last: string; confirmed: number; blocked: number; runs: number }>();
    for (const r of data ?? []) {
      const battery = String(r.battery ?? "");
      const key = (r.attack_ref as string) || battery;
      const cur = byClass.get(key) ?? {
        battery, title: (r.title as string) || BATTERY_INFO[battery]?.label || "Attack",
        owasp: (r.owasp_ref as string) ?? BATTERY_INFO[battery]?.owasp ?? null, atlas: (r.atlas_ref as string) ?? null,
        first: r.created_at as string, last: r.created_at as string, confirmed: 0, blocked: 0, runs: 0,
      };
      cur.runs++;
      cur.last = r.created_at as string;
      if (r.verdict === "confirmed") cur.confirmed++;
      else if (r.verdict === "blocked") cur.blocked++;
      byClass.set(key, cur);
    }
    tested = byClass.size;

    for (const [key, v] of byClass.entries()) {
      const item: AnticipatedItem = {
        id: key, title: v.title, attackClass: BATTERY_INFO[v.battery]?.label ?? v.battery,
        owasp: v.owasp, atlas: v.atlas, firstSeen: v.first, lastSeen: v.last,
        runs: v.runs, confirmed: v.confirmed, blocked: v.blocked,
        theBreak: BATTERY_INFO[v.battery]?.theBreak ?? "Close the mapped control and re-run to verify it's shut.",
      };
      // Any confirmed exploit means the class still works somewhere → open. Otherwise, if it
      // was tried and held, it's stopped with proof. Inconclusive-only classes are not shown.
      if (v.confirmed > 0) open.push(item);
      else if (v.blocked > 0) stopped.push(item);
    }
  } catch { /* red_team_results not migrated yet → no estate proof, radar only */ }

  const recent = (a: AnticipatedItem, b: AnticipatedItem) => (a.lastSeen < b.lastSeen ? 1 : -1);
  stopped.sort(recent);
  open.sort(recent);

  // radar — emerging classes from the fleet + PAL (persisted catalog, else the seed)
  let radar: NoveltyItem[];
  let network: NetworkStatus = { optedIn: false, contributed: 0, shared: 0 };
  try {
    const rows = await loadFrontier();
    radar = rows.length
      ? rows.map((r, i) => ({
          id: `frontier:${r.attack_class}:${i}`, title: r.title, attackClass: r.attack_class,
          owasp: r.owasp_ref, atlas: r.atlas_ref, source: sourceFromLabel(r.origin, r.source_label), sourceLabel: r.source_label,
          firstSeen: r.first_observed, status: r.origin === "graduated" ? "Confirmed across the fleet" : "Emerging — worth testing",
          whatItIs: r.what_it_is, whyItMatters: r.why_it_matters,
        }))
      : FRONTIER.map((f, i) => ({ ...f, id: `frontier:${i}` }));
    network = await networkStatus(orgId);
  } catch {
    radar = FRONTIER.map((f, i) => ({ ...f, id: `frontier:${i}` }));
  }

  return { stopped, open, radar, network, tested };
}
