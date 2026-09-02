import "server-only";
import { PILLAR_NAMES } from "@/components/console/theme";
import { techForControl, type StackSelection } from "@/lib/tech-catalog";

export interface PackControl {
  pillar: number;
  control: string;
  why: string | null;
  requirement: string;
  status: string;
  stack_implementation: string | null;
  evidence: string | null;
  assurance_test: string | null;
  framework_refs: { nist_ai_rmf?: string; iso_42001?: string; eu_ai_act?: string; owasp_llm?: string } | null;
  artifact_type?: string | null;
  artifact_filename?: string | null;
  artifact_content?: string | null;
}

const ARTIFACT_FOLDER: Record<string, string> = {
  terraform: "terraform",
  policy: "policies",
  config: "config",
  detection: "detections",
};

export interface PackMeta {
  name: string;
  tier: number | null;
  decision: string | null;
  methodologyVersion: string | null;
}

export interface PackFile {
  path: string;
  content: string;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);
}

function priorityOf(c: PackControl): string {
  return c.requirement === "required" ? "High" : c.requirement === "recommended" ? "Medium" : "Low";
}

function csvCell(s: string): string {
  return `"${(s ?? "").replace(/"/g, '""')}"`;
}

const base = (c: PackControl) => `${String(c.pillar).padStart(2, "0")}-${slug(c.control)}`;

const MANUAL = "Manual"; // controls with no specific configure-in tech (process / attestation)

/** The tech a control is configured in — the per-tech pack folder. */
function techOf(c: PackControl, stack: StackSelection | null): string {
  const techs = techForControl(c.control, stack);
  return techs.length ? techs[0] : MANUAL;
}

function sortControls(arr: PackControl[]): PackControl[] {
  const r = (x: PackControl) => (x.requirement === "required" ? 0 : x.requirement === "recommended" ? 1 : 2);
  return [...arr].sort((a, b) => r(a) - r(b) || a.pillar - b.pillar);
}

/** Build the Implementation Pack for a use case, organized PER TECH STACK: one folder per
 *  technology the controls are configured in (okta/, aws/, terraform/, …) so an engineer who owns
 *  that tech does everything in one place. Each folder has its own README + runbooks + generated
 *  artifacts, and every runbook cites its control + framework crosswalk. Manual/process controls
 *  (no specific tech) collect in a `manual/` folder. */
export function buildPack(meta: PackMeta, controls: PackControl[], stack: StackSelection | null): PackFile[] {
  const date = new Date().toISOString().slice(0, 10);
  const files: PackFile[] = [];

  // group by tech
  const groups = new Map<string, PackControl[]>();
  for (const c of controls) {
    const t = techOf(c, stack);
    const arr = groups.get(t);
    if (arr) arr.push(c); else groups.set(t, [c]);
  }
  // tech folders alphabetical, Manual last
  const techs = [...groups.keys()].sort((a, b) =>
    a === MANUAL ? 1 : b === MANUAL ? -1 : a.localeCompare(b),
  );

  // ── top-level README ──────────────────────────────────────────────────────
  const techList = techs
    .map((t) => `- **${slug(t)}/** — ${groups.get(t)!.length} control(s) configured in ${t}`)
    .join("\n");
  files.push({
    path: "README.md",
    content: `# Neo Implementation Pack — ${meta.name}

Tier: ${meta.tier ?? "—"}${meta.decision ? ` · Decision: ${meta.decision}` : ""}
Generated: ${date}${meta.methodologyVersion ? ` · Methodology ${meta.methodologyVersion}` : ""}

## Organized by technology
This pack is split into one folder per technology, so each owner implements their stack in one place:

${techList}

Each tech folder contains:
- **README.md** — the controls to configure in that tech, in order, with acceptance + evidence + framework crosswalk.
- **runbooks/** — one file per control: the step-by-step for that tech.
- **terraform/ · policies/ · config/ · detections/** — generated code scaffolds for that tech's controls (review before applying; \`TODO\` markers flag env-specific values).

Top level:
- **IMPLEMENTATION.md** — the master checklist across every tech.
- **tickets.csv** — import into Jira / Linear (one ticket per control, with a Tech column to route to the right team).

## Order of work
Hand each tech folder to its owner. Within a folder, do **required** controls first, then **recommended**.

> Engineering-ready starting artifacts to review and adapt — not blind "apply" scripts. Neo defines the controls; your team implements them in the named tech.
`,
  });

  // ── master IMPLEMENTATION.md grouped by tech ───────────────────────────────
  let master = "";
  for (const t of techs) {
    const cs = sortControls(groups.get(t)!);
    master += `\n## ${t}  (${cs.length} control${cs.length === 1 ? "" : "s"})\n`;
    master += cs
      .map((c) => `- [ ] **P${c.pillar} · ${c.control}** _(${c.requirement})_ → \`${slug(t)}/runbooks/${base(c)}.md\``)
      .join("\n");
    master += "\n";
  }
  files.push({
    path: "IMPLEMENTATION.md",
    content: `# Implementation checklist — ${meta.name}

${controls.length} control${controls.length === 1 ? "" : "s"} across ${techs.length} tech area${techs.length === 1 ? "" : "s"}. Work tech by tech; required first within each.
${master}`,
  });

  // ── per-tech folders ───────────────────────────────────────────────────────
  for (const t of techs) {
    const tslug = slug(t);
    const cs = sortControls(groups.get(t)!);

    // per-tech README
    const rows = cs
      .map((c) => {
        const fr = c.framework_refs ?? {};
        return `- [ ] **P${c.pillar} · ${c.control}** _(${c.requirement})_
    - Runbook: \`runbooks/${base(c)}.md\`
    - Acceptance: ${c.assurance_test ?? "—"}
    - Done when: ${c.evidence ?? "—"}
    - Crosswalk: NIST ${fr.nist_ai_rmf ?? "—"} · ISO ${fr.iso_42001 ?? "—"} · EU AI Act ${fr.eu_ai_act ?? "—"} · OWASP ${fr.owasp_llm ?? "—"}`;
      })
      .join("\n");
    files.push({
      path: `${tslug}/README.md`,
      content: `# ${t} — implementation

${cs.length} control${cs.length === 1 ? "" : "s"} ${t === MANUAL ? "with no specific configure-in tech (process / manual / attestation)." : `configured in ${t}.`} ${t === MANUAL ? "" : `Hand this folder to whoever owns ${t}.`}

${rows}
`,
    });

    // per-control runbooks + generated artifacts (nested in the tech folder)
    for (const c of cs) {
      const b = base(c);
      const fr = c.framework_refs ?? {};

      let artifactSection = "";
      if (c.artifact_content && c.artifact_type && ARTIFACT_FOLDER[c.artifact_type]) {
        const folder = ARTIFACT_FOLDER[c.artifact_type];
        const fname = c.artifact_filename || `${b}.txt`;
        files.push({ path: `${tslug}/${folder}/${fname}`, content: c.artifact_content });
        artifactSection = `\n## Generated artifact (review before applying)\nSee \`${folder}/${fname}\` — a starting scaffold. Adapt the \`TODO\` values to your environment.\n`;
      }

      files.push({
        path: `${tslug}/runbooks/${b}.md`,
        content: `# ${c.control}

Tech: ${t}  ·  Pillar ${c.pillar} — ${PILLAR_NAMES[c.pillar] ?? "—"}  ·  Requirement: ${c.requirement}

## Why this control
${c.why ?? "—"}

## Implement (in ${t})
${c.stack_implementation ?? "Generated before stack-aware mapping — re-run the Controls stage with your stack declared."}
${artifactSection}
## Acceptance criteria (the test that proves it works)
${c.assurance_test ?? "—"}

## Done when (evidence to capture)
${c.evidence ?? "—"}

## Framework references
- NIST AI RMF: ${fr.nist_ai_rmf ?? "—"}
- ISO/IEC 42001: ${fr.iso_42001 ?? "—"}
- EU AI Act: ${fr.eu_ai_act ?? "—"}
- OWASP LLM/Agentic: ${fr.owasp_llm ?? "—"}
`,
      });
    }
  }

  // ── tickets.csv (with a Tech column to route to the right team) ─────────────
  const header = "Summary,Tech,Description,Acceptance Criteria,Priority,Labels";
  const rows = controls.map((c) => {
    const t = techOf(c, stack);
    const desc = `${c.why ?? ""}\n\nImplement (in ${t}):\n${c.stack_implementation ?? ""}\n\nDone when (evidence): ${c.evidence ?? ""}`;
    const labels = `${slug(t)};${slug(PILLAR_NAMES[c.pillar] ?? "control")};ai-control`;
    return [
      csvCell(c.control),
      csvCell(t),
      csvCell(desc),
      csvCell(c.assurance_test ?? ""),
      csvCell(priorityOf(c)),
      csvCell(labels),
    ].join(",");
  });
  files.push({ path: "tickets.csv", content: [header, ...rows].join("\n") + "\n" });

  return files;
}
