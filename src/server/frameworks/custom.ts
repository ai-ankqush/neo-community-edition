import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";
import { ENGINE_MODELS } from "@/server/methodology/version";
import { PILLAR_NAMES } from "@/components/console/theme";
import { matchCatalogue } from "./catalogues";

/**
 * Custom (customer-owned) frameworks and their crosswalk to Neo's controls.
 *
 * Resolution mirrors the built-in crosswalk: a control's reference is its per-CONTROL override if one
 * exists, otherwise the PILLAR mapping. Neo can propose the pillar crosswalk from the framework's name
 * or a pasted control list; the customer confirms — nothing is treated as authoritative until then.
 */

export interface OrgFramework {
  id: string; key: string; name: string; description: string | null; authority: string | null;
  catalogue?: string | null;
}
export interface FrameworkMapping {
  id: string; framework_id: string; scope: "pillar" | "control";
  pillar: number | null; control_id: string | null;
  reference: string; note: string | null; status: "suggested" | "confirmed"; source: "neo" | "human";
}

export async function loadFrameworks(orgId: string): Promise<{ frameworks: OrgFramework[]; mappings: FrameworkMapping[] }> {
  const sb = supabaseAdmin();
  const [{ data: fw }, { data: maps }] = await Promise.all([
    sb.from("org_frameworks").select("id, key, name, description, authority, catalogue").eq("org_id", orgId).order("created_at"),
    sb.from("org_framework_mappings").select("id, framework_id, scope, pillar, control_id, reference, note, status, source").eq("org_id", orgId),
  ]);
  return { frameworks: (fw ?? []) as OrgFramework[], mappings: (maps ?? []) as FrameworkMapping[] };
}

/** Resolve one framework's reference for a specific control: control override wins, else pillar. */
export function resolveRef(
  mappings: FrameworkMapping[], frameworkId: string, pillar: number | null, controlId: string,
): { reference: string; status: string; source: string } | null {
  const override = mappings.find((m) => m.framework_id === frameworkId && m.scope === "control" && m.control_id === controlId);
  if (override) return { reference: override.reference, status: override.status, source: override.source };
  if (pillar != null) {
    const p = mappings.find((m) => m.framework_id === frameworkId && m.scope === "pillar" && m.pillar === pillar);
    if (p) return { reference: p.reference, status: p.status, source: p.source };
  }
  return null;
}

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "framework";
}

/**
 * Ask Neo to propose the pillar-level crosswalk. Given the framework name (+ optionally the customer's
 * pasted control list) and Neo's 10 pillars, it returns a best-guess reference per pillar for the
 * customer to confirm or correct. The model ARTICULATES the mapping — the human decides it.
 */
const PILLAR_INTENT: Record<number, string> = {
  1: "AI inventory — every AI use case and model catalogued",
  2: "Identity & access — who and what may invoke the AI, and its own permissions",
  3: "Data boundary — what data the AI may see; PII / confidential handling",
  4: "Input control — prompt-injection and malicious-input defence",
  5: "Output control — review, filtering and disclosure of AI output",
  6: "Tool & action — what the AI may DO; action approval and scoping",
  7: "Accountability — named owners, roles, independence, sign-off",
  8: "Assurance — testing, validation and effective challenge",
  9: "Containment — monitoring, audit trail, kill-switch, incident readiness",
  10: "Lifecycle — change, decommissioning, ongoing review",
};

const SUGGEST_TOOL: Anthropic.Tool = {
  name: "map_framework",
  description: "Return the customer framework's reference for each Neo pillar.",
  input_schema: {
    type: "object",
    properties: {
      mappings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            pillar: { type: "integer" },
            reference: { type: "string", description: "The customer framework's control id(s)/clause(s) for this pillar, or empty if none applies." },
            note: { type: "string" },
          },
          required: ["pillar", "reference"],
        },
      },
    },
    required: ["mappings"],
  },
};

const CATALOGUE_TOOL: Anthropic.Tool = {
  name: "recall_catalogue",
  description: "Recall a named security/compliance framework's REAL control catalogue so it can be crosswalked.",
  input_schema: {
    type: "object",
    properties: {
      known: { type: "boolean", description: "true ONLY if you confidently know this exact framework's real control identifiers." },
      catalogue: { type: "string", description: "The framework's controls, one per line as 'ID — Title' using REAL identifiers (e.g. 'CLD.6.3.1 — Shared roles and responsibilities'). Empty if not known." },
      note: { type: "string", description: "If not known, a short line telling the customer to paste the catalogue." },
    },
    required: ["known", "catalogue"],
  },
};

/** Where the catalogue Neo mapped against came from. */
export type MappingSource = "builtin" | "pasted" | "generated" | "stored" | "none";

export interface SuggestResult {
  saved: number;                 // pillar mappings written (suggested)
  source: MappingSource;         // how Neo got the control list
  coveredPillars: number[];      // pillars Neo could map to a real control
  uncoveredPillars: number[];    // pillars this framework has no equivalent for (the honest gap)
  note: string;                  // human-facing guidance (esp. when source === "none")
}

/**
 * Neo recalls a named framework's ACTUAL control catalogue from its own knowledge, so the crosswalk
 * maps to verifiable control IDs — the "Neo adds the framework itself" capability. Conservative by
 * design: if Neo doesn't confidently know the scheme it returns known=false rather than inventing IDs.
 */
async function generateCatalogue(
  client: Anthropic, fw: { name: string; authority: string | null; description: string | null },
): Promise<{ known: boolean; catalogue: string; note: string }> {
  const sys =
    `You recall the ACTUAL control catalogue of a named security / compliance / governance framework so it can be ` +
    `crosswalked to another control set. Return the framework's real controls — one per line as "ID — Title" using the ` +
    `genuine identifiers and titles from that exact framework/version (e.g. "CLD.6.3.1 — Shared roles and responsibilities ` +
    `within a cloud computing environment", "A.8.24 — Use of cryptography"). Use ONLY identifiers you are confident are ` +
    `REAL for this framework. If you do NOT confidently know this framework's control scheme, set known=false and return ` +
    `an empty catalogue — NEVER invent or approximate identifiers.`;
  const user =
    `Framework: "${fw.name}"${fw.authority ? ` (authority: ${fw.authority})` : ""}` +
    `${fw.description ? `. Description: ${fw.description}` : ""}. Recall its full control catalogue.`;
  const msg = await client.messages.create({
    model: ENGINE_MODELS.deep, max_tokens: 4000,
    system: sys, messages: [{ role: "user", content: user }],
    tools: [CATALOGUE_TOOL], tool_choice: { type: "tool", name: "recall_catalogue" },
  });
  const block = msg.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") return { known: false, catalogue: "", note: "" };
  const out = block.input as { known?: boolean; catalogue?: string; note?: string };
  const catalogue = (out.catalogue ?? "").trim();
  return { known: Boolean(out.known) && catalogue.length > 0, catalogue, note: (out.note ?? "").trim() };
}

export async function suggestMappings(orgId: string, frameworkId: string, pastedCatalog?: string): Promise<SuggestResult> {
  const sb = supabaseAdmin();
  const { data: fw } = await sb.from("org_frameworks").select("name, description, authority, catalogue").eq("org_id", orgId).eq("id", frameworkId).maybeSingle();
  if (!fw) throw new Error("Framework not found");

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const allPillars = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  // Resolve the control catalogue Neo will map against, in order of trust:
  //   pasted (customer authoritative) → built-in (curated) → previously stored → Neo recalls it itself.
  let catalogue: string | null = null;
  let source: MappingSource = "none";
  const pasted = pastedCatalog?.trim();
  if (pasted) {
    catalogue = pasted; source = "pasted";
    await sb.from("org_frameworks").update({ catalogue: pasted.slice(0, 20000) }).eq("org_id", orgId).eq("id", frameworkId);
  } else {
    const builtin = matchCatalogue(fw.name);
    if (builtin) { catalogue = builtin.catalogue; source = "builtin"; }
    else if ((fw.catalogue as string | null)?.trim()) { catalogue = (fw.catalogue as string).trim(); source = "stored"; }
    else {
      // Neo adds the framework: recall its real control catalogue itself.
      const gen = await generateCatalogue(client, { name: fw.name, authority: fw.authority, description: fw.description });
      if (gen.known) {
        catalogue = gen.catalogue; source = "generated";
        await sb.from("org_frameworks").update({ catalogue: gen.catalogue.slice(0, 20000) }).eq("org_id", orgId).eq("id", frameworkId);
      } else {
        return {
          saved: 0, source: "none", coveredPillars: [], uncoveredPillars: allPillars,
          note: gen.note || `Neo doesn't recognise "${fw.name}" well enough to map it safely — paste its control list and Neo will crosswalk it precisely.`,
        };
      }
    }
  }

  const pillars = Object.entries(PILLAR_INTENT).map(([n, intent]) => `Pillar ${n} — ${PILLAR_NAMES[Number(n)]}: ${intent}`).join("\n");
  const sys =
    `You crosswalk the Neo AI Control Architecture (10 pillars below) to a CUSTOMER'S control framework. ` +
    `For each pillar, return the framework's control reference(s) that best correspond — the specific, real ` +
    `control id / clause / section (e.g. "CC6.1", "A.8.24", "CLD.6.3.1"), not a paraphrase. ` +
    `Only use references that appear in the catalogue below. If a pillar has NO corresponding control in this ` +
    `framework, return an empty reference for it — that honest gap is expected and useful. NEVER invent identifiers.\n\n` +
    `NEO PILLARS:\n${pillars}`;
  const user =
    `Customer framework: "${fw.name}"${fw.authority ? ` (owner/authority: ${fw.authority})` : ""}.` +
    `${fw.description ? ` Description: ${fw.description}.` : ""}` +
    `\n\nControl catalogue (map each pillar to these exact references only):\n${catalogue.slice(0, 12000)}`;

  const msg = await client.messages.create({
    model: ENGINE_MODELS.deep, max_tokens: 1500,
    system: sys, messages: [{ role: "user", content: user }],
    tools: [SUGGEST_TOOL], tool_choice: { type: "tool", name: "map_framework" },
  });
  const block = msg.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("No suggestion returned");
  const out = block.input as { mappings: { pillar: number; reference: string; note?: string }[] };

  let saved = 0;
  const covered: number[] = [];
  for (const m of out.mappings ?? []) {
    const ref = (m.reference ?? "").trim();
    if (!ref) continue;
    if (m.pillar < 1 || m.pillar > 10) continue;
    // upsert a SUGGESTED pillar mapping; never overwrite one the human already confirmed
    const { data: existing } = await sb.from("org_framework_mappings")
      .select("id, status").eq("org_id", orgId).eq("framework_id", frameworkId).eq("scope", "pillar").eq("pillar", m.pillar).maybeSingle();
    if (existing?.status === "confirmed") { covered.push(m.pillar); continue; }
    if (existing?.id) {
      await sb.from("org_framework_mappings").update({ reference: ref, note: m.note ?? null, source: "neo", status: "suggested", updated_at: new Date().toISOString() }).eq("id", existing.id);
    } else {
      await sb.from("org_framework_mappings").insert({ org_id: orgId, framework_id: frameworkId, scope: "pillar", pillar: m.pillar, reference: ref, note: m.note ?? null, source: "neo", status: "suggested" });
    }
    if (!covered.includes(m.pillar)) covered.push(m.pillar);
    saved++;
  }

  covered.sort((a, b) => a - b);
  const uncovered = allPillars.filter((p) => !covered.includes(p));
  let note = "";
  if (source === "generated") note = `Neo recalled ${fw.name}'s controls itself and mapped what it found — review and confirm each reference.`;
  else if (source === "stored") note = "Mapped against the catalogue already on file for this framework.";
  if (saved > 0 && uncovered.length > 0) {
    note += `${note ? " " : ""}${uncovered.length} pillar${uncovered.length === 1 ? " has" : "s have"} no equivalent in this framework — that gap is a genuine finding, not a miss.`;
  }
  if (saved === 0) {
    note = `Neo produced a catalogue for "${fw.name}" but couldn't confidently align any pillar to it. Paste or edit the catalogue and try again.`;
  }
  return { saved, source, coveredPillars: covered, uncoveredPillars: uncovered, note };
}
