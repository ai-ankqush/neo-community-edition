/** Curated home — the plated, plain-English face of the whole estate.
 *
 *  Same engines, same data as the full dashboard ("Advanced"); this is the
 *  presentation layer that reads the estate at four altitudes and shows each
 *  reader only what they need first. Pure + derived from the ControlGraph the
 *  dashboard already loads, so every tile count ties out to the groups below.
 *  See memory: simple-home-main-page. */

import type { CGUseCase, ControlGraph } from "./control-graph";
import { buildEstateInsights, type EstateInsight } from "./estate-insights";

export type UCVerdict = "ready" | "needs_decision" | "build" | "in_progress";

export interface CuratedRow {
  id: string;
  name: string;
  line: string;
  action: string;
  href: string;
}

export interface KnowingRow {
  key: string;
  text: string;
  href: string;
}

export interface CuratedHomeModel {
  total: number;
  ready: number;
  governedPct: number;        // % of use cases fully in place + decided ("governed & proven")
  activeTasks: number;        // decisions + build items — the actionable backlog
  modelProviders: number;
  dataSources: number;
  decisions: CuratedRow[];
  build: CuratedRow[];
  inProgress: CuratedRow[];
  knowing: KnowingRow[];
}

/** One use case → one plain verdict, from the same signals the Control Picture uses. */
export function verdictFor(u: CGUseCase): UCVerdict {
  if (!u.controlsRequired) return "in_progress";                 // assessment not far enough yet
  if (u.controlsImplemented < u.controlsRequired) return "build"; // controls still to put in place
  if (!u.decided) return "needs_decision";                        // controls in place, awaiting sign-off
  return "ready";                                                 // in place + decided
}

/** Where a "Worth knowing" insight should deep-link. Focus/lens insights open the
 *  map; explicit link insights keep their own href. */
function insightHref(i: EstateInsight): string {
  if (i.action.kind === "link") return i.action.href;
  return "/dashboard/control-graph";
}

const ucHref = (id: string) => `/dashboard/use-cases/${id}`;

export function buildCuratedHome(graph: ControlGraph): CuratedHomeModel {
  const ucs = graph.useCases;
  const total = ucs.length;
  const tagged = ucs.map((u) => ({ u, v: verdictFor(u) }));

  const ready = tagged.filter((x) => x.v === "ready").length;

  const decisions: CuratedRow[] = tagged
    .filter((x) => x.v === "needs_decision")
    .map(({ u }) => ({
      id: u.id,
      name: u.name,
      line: `${u.name} is waiting for sign-off`,
      action: "Decide",
      href: ucHref(u.id),
    }));

  const build: CuratedRow[] = tagged
    .filter((x) => x.v === "build")
    .map(({ u }) => {
      const missing = Math.max(1, u.controlsRequired - u.controlsImplemented);
      return {
        id: u.id,
        name: u.name,
        line: `${u.name} — ${missing} control${missing === 1 ? "" : "s"} to put in place`,
        action: "Open",
        href: ucHref(u.id),
      };
    });

  const inProgress: CuratedRow[] = tagged
    .filter((x) => x.v === "in_progress")
    .map(({ u }) => ({
      id: u.id,
      name: u.name,
      line: `${u.name} — Neo is working out its Control Picture`,
      action: "View",
      href: ucHref(u.id),
    }));

  const knowing: KnowingRow[] = buildEstateInsights(graph, 3).map((i) => ({
    key: i.key,
    text: i.text,
    href: insightHref(i),
  }));

  const modelProviders = graph.entities.filter((e) => e.kind === "model").length;
  const dataSources = graph.entities.filter((e) => e.kind === "data").length;

  return {
    total,
    ready,
    governedPct: total ? Math.round((ready / total) * 100) : 0,
    activeTasks: decisions.length + build.length,
    modelProviders,
    dataSources,
    decisions,
    build,
    inProgress,
    knowing,
  };
}
