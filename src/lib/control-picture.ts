/** The Control Picture — the plain-English face of a single AI use case.
 *
 *  Verdict on top, then the four questions in human words: what it touches, what
 *  it can do, what could go wrong, what proves it's controlled. The graphs are
 *  the evidence underneath; this is the answer on the surface. Pure + derived
 *  from data the use-case page already loads. See NeoControl-Product-Language.md. */

import { entityKind, actsHighImpact, seesSensitive } from "./control-graph";

export type VerdictState = "ready" | "conditions" | "not_ready" | "needs_decision" | "in_progress";
export type ChipTone = "model" | "data" | "tool" | "vendor_ok" | "vendor_warn";

export interface ControlPicture {
  verdict: { state: VerdictState; headline: string; sub: string };
  touches: { sentence: string; chips: { label: string; tone: ChipTone }[]; count: number };
  canDo: { sentence: string; detail: string };
  couldGoWrong: { sentence: string; detail: string };
  proof: { sentence: string; items: { label: string; ok: boolean }[] };
}

export interface CPInput {
  tier: number | null;
  classify: { see?: string[]; decide?: string[]; do?: string[] } | null;
  products: { category: string; name: string }[];
  vendorStatus: Record<string, "reviewed" | "self">;   // product name (lower) → status
  controls: { status: string; verification_status: string | null }[];
  redFindings: { severity: string; outcome: string }[];
  decided: boolean;
  openConditions: number;
}

const AI_CATS = new Set(["ai_platform", "agent_framework", "identified"]);
const list = (arr: string[], n = 2) => arr.slice(0, n).join(", ");

export function buildControlPicture(i: CPInput): ControlPicture {
  const sees = (i.classify?.see ?? []).filter(Boolean);
  const does = (i.classify?.do ?? []).filter(Boolean);
  const sensitive = seesSensitive(sees);
  const canAct = actsHighImpact(does);

  // ---- Touches ----
  const models: string[] = [], data: string[] = [], tools: string[] = [];
  const vendors: { name: string; status: "reviewed" | "self" | "unassessed" }[] = [];
  for (const p of i.products) {
    const name = (p.name ?? "").trim();
    if (!name) continue;
    if (AI_CATS.has(p.category)) {
      vendors.push({ name, status: i.vendorStatus[name.toLowerCase()] ?? "unassessed" });
    }
    const k = entityKind(p.category, name);
    if (k === "model") models.push(name);
    else if (k === "data") data.push(name);
    else tools.push(name);
  }
  const count = i.products.length;
  const parts: string[] = [];
  if (models.length) parts.push(models.length === 1 ? "a model" : `${models.length} models`);
  if (data.length) parts.push(data.length === 1 ? "a data source" : `${data.length} data sources`);
  if (tools.length) parts.push(tools.length === 1 ? "a tool" : `${tools.length} tools`);
  if (vendors.length) parts.push(vendors.length === 1 ? "a vendor product" : `${vendors.length} vendor products`);
  const chips: { label: string; tone: ChipTone }[] = [
    ...models.map((m) => ({ label: m, tone: "model" as ChipTone })),
    ...data.map((d) => ({ label: d, tone: "data" as ChipTone })),
    ...tools.map((t) => ({ label: t, tone: "tool" as ChipTone })),
    ...vendors.map((v) => ({ label: v.name, tone: (v.status === "unassessed" ? "vendor_warn" : "vendor_ok") as ChipTone })),
  ].slice(0, 10);
  const touches = {
    count,
    sentence: count === 0 ? "Nothing declared yet — add the stack to see what this AI is built on." : `This AI is built on ${count} thing${count === 1 ? "" : "s"} — ${parts.join(", ")}.`,
    chips,
  };

  // ---- Can do ----
  const readPart = sees.length ? `read ${list(sees)}` : "";
  const actPart = canAct ? "and take actions on its own" : "but it can't take actions on its own";
  const canDo = {
    sentence: sees.length || does.length
      ? `It can ${readPart}${readPart ? ", " : ""}${actPart}.`
      : "What it can see and do hasn't been classified yet.",
    detail: canAct
      ? "Because it can act without a human pressing the button, it's treated as a real risk, not just an assistant."
      : "It needs a person to take any real action, which keeps the risk lower.",
  };

  // ---- Could go wrong ----
  const red = [...i.redFindings].sort((a, b) => sevRank(a.severity) - sevRank(b.severity))[0];
  const couldGoWrong = red
    ? { sentence: red.outcome || "An attacker could misuse a path through this AI.", detail: `Worst case found so far, rated ${red.severity}. The full attack paths are in Red Team.` }
    : {
        sentence: canAct
          ? `If a tool it trusts is fed a bad instruction, it could ${sensitive ? "move customer data outside the company" : "take an action you didn't intend"}.`
          : "The main risk is a wrong or misleading answer rather than a harmful action.",
        detail: "Run Red Team on this use case to map the real attack paths and what stops them.",
      };

  // ---- Proof ----
  const required = i.controls.length;
  const inPlace = i.controls.filter((c) => c.status === "in_place").length;
  const evidenced = i.controls.filter((c) => c.verification_status === "verified").length;
  const missing = Math.max(0, required - inPlace);
  const proof = {
    sentence: required === 0
      ? "No controls assigned yet — finish the review to see what's required."
      : `${inPlace} of ${required} controls are in place${evidenced ? `, and ${evidenced} are backed by evidence` : ""}.${missing ? ` ${missing} still missing.` : ""}`,
    items: [
      { label: `${inPlace} of ${required} controls in place`, ok: required > 0 && missing === 0 },
      { label: evidenced ? `${evidenced} backed by verified evidence` : "No verified evidence yet", ok: evidenced > 0 },
    ],
  };

  // ---- Verdict ----
  const unreviewed = vendors.filter((v) => v.status === "unassessed").length;
  const fixes: string[] = [];
  if (missing > 0) fixes.push(missing === 1 ? "one control to put in place" : `${missing} controls to put in place`);
  if (unreviewed > 0) fixes.push(unreviewed === 1 ? "a vendor tool to review" : `${unreviewed} vendor tools to review`);

  let verdict: ControlPicture["verdict"];
  if (required === 0) {
    verdict = { state: "in_progress", headline: "Assessment in progress", sub: "Finish the control review to get a verdict." };
  } else if (fixes.length > 0) {
    verdict = { state: "not_ready", headline: `Not ready — ${fixes.length} thing${fixes.length === 1 ? "" : "s"} to fix`, sub: `There's ${fixes.join(", and ")}.` };
  } else if (!i.decided) {
    verdict = { state: "needs_decision", headline: "Needs a decision", sub: "Controls look good — it just needs a recorded sign-off." };
  } else if (i.openConditions > 0) {
    verdict = { state: "conditions", headline: "Ready with conditions", sub: `Cleared to run, with ${i.openConditions} condition${i.openConditions === 1 ? "" : "s"} to keep an eye on.` };
  } else {
    verdict = { state: "ready", headline: "Ready", sub: "Controls are in place, proven, and signed off." };
  }

  return { verdict, touches, canDo, couldGoWrong, proof };
}

function sevRank(s: string): number {
  const m: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return m[(s ?? "").toLowerCase()] ?? 4;
}
