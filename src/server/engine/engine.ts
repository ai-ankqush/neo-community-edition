import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getModelClient, resolveModel } from "@/server/model/provider";
import type { Stage } from "@/lib/types/stages";
import { METHODOLOGY_VERSION, ENGINE_MODELS } from "@/server/methodology/version";
import { CLASSIFY_SYSTEM } from "@/server/methodology/classify";
import { TIER_SYSTEM } from "@/server/methodology/tier";
import { QUESTIONS_SYSTEM } from "@/server/methodology/questions";
import { CONTROLS_SYSTEM } from "@/server/methodology/controls";
import { EVIDENCE_SYSTEM } from "@/server/methodology/evidence";
import { ASSURANCE_SYSTEM } from "@/server/methodology/assurance";
import { DECISION_SYSTEM } from "@/server/methodology/decision";
import {
  ClassifyOutput, TierOutput, QuestionsOutput, ControlsOutput,
  EvidenceOutput, AssuranceOutput, DecisionOutput,
  ControlsPartialOutput, ArtifactsOutput, RedTeamOutput,
  CLASSIFY_TOOL_SCHEMA, TIER_TOOL_SCHEMA,
  QUESTIONS_TOOL_SCHEMA, CONTROLS_TOOL_SCHEMA, CONTROLS_PARTIAL_TOOL_SCHEMA,
  EVIDENCE_TOOL_SCHEMA, ASSURANCE_TOOL_SCHEMA, DECISION_TOOL_SCHEMA,
  ARTIFACTS_TOOL_SCHEMA, RED_TEAM_TOOL_SCHEMA,
} from "./schemas";
import { ARTIFACTS_SYSTEM } from "@/server/methodology/artifacts";
import { RED_TEAM_SYSTEM } from "@/server/methodology/red-team";
import { PILLAR_NAMES } from "@/components/console/theme";

function priorBlock(prior: PriorStage[], stages: string[]): string {
  return stages
    .map((s) => {
      const rec = prior.find((p) => p.stage === s);
      return `ACCEPTED ${s.toUpperCase()} STAGE:\n${JSON.stringify(rec?.output ?? "not available", null, 2)}`;
    })
    .join("\n\n");
}

export interface EngineResult {
  draft: unknown;
  model: string;
  methodologyVersion: string;
  usage: { inputTokens: number; outputTokens: number };
  implemented: boolean; // false = stage not yet engine-backed
}

interface StageConfig {
  system: string;
  toolSchema: Record<string, unknown>;
  validate: (v: unknown) => unknown;
  model: string;
  maxTokens?: number;
  buildUser: (input: Record<string, unknown>, priorStages: PriorStage[]) => string;
}

export interface PriorStage {
  stage: string;
  output: unknown;
}

const STAGE_CONFIG: Partial<Record<Stage, StageConfig>> = {
  classify: {
    system: CLASSIFY_SYSTEM,
    toolSchema: CLASSIFY_TOOL_SCHEMA,
    validate: (v) => ClassifyOutput.parse(v),
    model: ENGINE_MODELS.fast,
    buildUser: (input) =>
      `Classify this AI use case.\n\nUSE CASE NAME: ${input.name ?? "(unnamed)"}\n\nDESCRIPTION:\n${input.description ?? "(no description provided)"}`,
  },
  tier: {
    system: TIER_SYSTEM,
    toolSchema: TIER_TOOL_SCHEMA,
    validate: (v) => TierOutput.parse(v),
    model: ENGINE_MODELS.deep,
    buildUser: (input, prior) => {
      const classify = prior.find((p) => p.stage === "classify");
      return `Assign the risk tier for this AI use case.\n\nUSE CASE NAME: ${input.name ?? "(unnamed)"}\n\nDESCRIPTION:\n${input.description ?? "(none)"}\n\nACCEPTED CLASSIFICATION (Stage 1):\n${JSON.stringify(classify?.output ?? "not available", null, 2)}`;
    },
  },
  questions: {
    system: QUESTIONS_SYSTEM,
    toolSchema: QUESTIONS_TOOL_SCHEMA,
    validate: (v) => QuestionsOutput.parse(v),
    model: ENGINE_MODELS.fast,
    buildUser: (input, prior) => {
      const classify = prior.find((p) => p.stage === "classify");
      const tier = prior.find((p) => p.stage === "tier");
      return `Generate the tailored follow-up questions for this AI use case.\n\nUSE CASE NAME: ${input.name ?? "(unnamed)"}\n\nDESCRIPTION:\n${input.description ?? "(none)"}\n\nACCEPTED CLASSIFICATION:\n${JSON.stringify(classify?.output ?? "not available", null, 2)}\n\nACCEPTED RISK TIER:\n${JSON.stringify(tier?.output ?? "not available", null, 2)}`;
    },
  },
  controls: {
    system: CONTROLS_SYSTEM,
    toolSchema: CONTROLS_TOOL_SCHEMA,
    validate: (v) => ControlsOutput.parse(v),
    model: ENGINE_MODELS.deep,
    maxTokens: 16000,
    buildUser: (input, prior) => {
      const classify = prior.find((p) => p.stage === "classify");
      const tier = prior.find((p) => p.stage === "tier");
      const qa = (input.qa as { question: string; answer: string }[] | undefined) ?? [];
      const qaText = qa.length
        ? qa.map((x) => `Q: ${x.question}\nA: ${x.answer}`).join("\n\n")
        : "(no question answers captured)";
      return `Select the controls for this AI use case and map them to the declared stack.\n\nUSE CASE NAME: ${input.name ?? "(unnamed)"}\n\nDESCRIPTION:\n${input.description ?? "(none)"}\n\nACCEPTED CLASSIFICATION:\n${JSON.stringify(classify?.output ?? "not available", null, 2)}\n\nACCEPTED RISK TIER:\n${JSON.stringify(tier?.output ?? "not available", null, 2)}\n\nQUESTION ANSWERS FROM THE CLIENT:\n${qaText}\n\nDECLARED TECHNOLOGY STACK:\n${JSON.stringify(input.stack ?? "(not captured - note what to capture per control)", null, 2)}`;
    },
  },
  evidence: {
    system: EVIDENCE_SYSTEM,
    toolSchema: EVIDENCE_TOOL_SCHEMA,
    validate: (v) => EvidenceOutput.parse(v),
    model: ENGINE_MODELS.fast,
    maxTokens: 8000,
    buildUser: (input, prior) =>
      `Generate the consolidated evidence request list for this AI use case.\n\nUSE CASE NAME: ${input.name ?? "(unnamed)"}\n\n${priorBlock(prior, ["classify", "tier", "controls"])}`,
  },
  assurance: {
    system: ASSURANCE_SYSTEM,
    toolSchema: ASSURANCE_TOOL_SCHEMA,
    validate: (v) => AssuranceOutput.parse(v),
    model: ENGINE_MODELS.fast,
    maxTokens: 8000,
    buildUser: (input, prior) =>
      `Generate the assurance test plan for this AI use case.\n\nUSE CASE NAME: ${input.name ?? "(unnamed)"}\n\n${priorBlock(prior, ["classify", "tier", "controls", "evidence"])}`,
  },
  decision: {
    system: DECISION_SYSTEM,
    toolSchema: DECISION_TOOL_SCHEMA,
    validate: (v) => DecisionOutput.parse(v),
    model: ENGINE_MODELS.deep,
    maxTokens: 6000,
    buildUser: (input, prior) =>
      `Produce the approval recommendation for this AI use case.\n\nUSE CASE NAME: ${input.name ?? "(unnamed)"}\n\nDESCRIPTION:\n${input.description ?? "(none)"}\n\n${priorBlock(prior, ["classify", "tier", "questions", "controls", "evidence", "assurance"])}`,
  },
};

export function isEngineBacked(stage: Stage): boolean {
  return stage in STAGE_CONFIG;
}

export async function runStage(
  stage: Stage,
  input: Record<string, unknown>,
  priorStages: PriorStage[],
  orgId?: string
): Promise<EngineResult> {
  const cfg = STAGE_CONFIG[stage];
  if (!cfg) {
    return {
      draft: { note: `Stage '${stage}' is not engine-backed yet.` },
      model: "none",
      methodologyVersion: METHODOLOGY_VERSION,
      usage: { inputTokens: 0, outputTokens: 0 },
      implemented: false,
    };
  }

  const client = await getModelClient(orgId);

  // Streaming with final-message assembly: identical output, but immune to
  // the ~5 minute idle HTTP timeouts that kill long non-streaming generations.
  // Prompt caching: the methodology system prompt and tool schema are large and
  // static per stage. Marking them cacheable cuts input cost ~90% and latency on
  // cache hits — repeated/concurrent same-stage runs (incl. the controls per-pillar
  // fan-out) reuse the cached prefix within the ~5 min ephemeral window.
  const stream = client.messages.stream({
    model: resolveModel(client, cfg.model),
    max_tokens: cfg.maxTokens ?? 3000,
    system: [{ type: "text", text: cfg.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: cfg.buildUser(input, priorStages) }],
    tools: [
      {
        name: "submit_assessment",
        description: "Submit the structured assessment output for this stage.",
        input_schema: cfg.toolSchema as Anthropic.Tool["input_schema"],
        cache_control: { type: "ephemeral" },
      },
    ],
    tool_choice: { type: "tool", name: "submit_assessment" },
  });
  const msg = await stream.finalMessage();

  if (msg.stop_reason === "max_tokens") {
    throw new Error(
      `Engine output truncated at ${cfg.maxTokens ?? 3000} tokens for stage '${stage}' - raise maxTokens or tighten the prompt`
    );
  }

  const toolUse = msg.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
  );
  if (!toolUse) throw new Error("Engine returned no structured output");

  // Validate against our schema; throws on mismatch (route returns 502-style error)
  const draft = cfg.validate(toolUse.input);

  return {
    draft,
    model: resolveModel(client, cfg.model),
    methodologyVersion: METHODOLOGY_VERSION,
    usage: {
      inputTokens: msg.usage.input_tokens,
      outputTokens: msg.usage.output_tokens,
    },
    implemented: true,
  };
}

// ---- controls fan-out (Layer 3b) ----
// The controls stage is the heaviest single call (16k tokens) and the one most
// likely to brush the function timeout. We split it into parallel calls scoped
// to pillar groups; each call is small, shares the cached system prompt, and
// finishes well under the cap. Results are merged and validated as a whole.
export const CONTROLS_PILLAR_GROUPS: number[][] = [[1, 2, 3], [4, 5, 6], [7, 8], [9, 10]];

export interface ControlsPartialResult {
  controls: ControlsOutput["controls"];
  model: string;
  methodologyVersion: string;
  usage: { inputTokens: number; outputTokens: number };
}

export async function runControlsForPillars(
  pillars: number[],
  input: Record<string, unknown>,
  priorStages: PriorStage[],
  orgId?: string
): Promise<ControlsPartialResult> {
  const cfg = STAGE_CONFIG.controls!;
  const client = await getModelClient(orgId);
  const pillarList = pillars.map((p) => `${p} (${PILLAR_NAMES[p]})`).join(", ");
  const user =
    `${cfg.buildUser(input, priorStages)}\n\n` +
    `SCOPE — IMPORTANT: Output controls ONLY for these pillars: ${pillarList}. ` +
    `Do not include controls for any other pillar. Apply the same tier minimums and rigor as usual, but only within these pillars.`;

  const stream = client.messages.stream({
    model: resolveModel(client, cfg.model),
    max_tokens: 8000,
    system: [{ type: "text", text: cfg.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
    tools: [
      {
        name: "submit_assessment",
        description: "Submit the structured controls for the requested pillars.",
        input_schema: CONTROLS_PARTIAL_TOOL_SCHEMA as Anthropic.Tool["input_schema"],
        cache_control: { type: "ephemeral" },
      },
    ],
    tool_choice: { type: "tool", name: "submit_assessment" },
  });
  const msg = await stream.finalMessage();

  if (msg.stop_reason === "max_tokens") {
    throw new Error(`Controls output truncated for pillars ${pillarList} - tighten or split further`);
  }
  const toolUse = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!toolUse) throw new Error(`Engine returned no controls for pillars ${pillarList}`);

  const parsed = ControlsPartialOutput.parse(toolUse.input);
  // guard against the model straying outside the requested pillars
  const controls = parsed.controls.filter((c) => pillars.includes(c.pillar));

  return {
    controls,
    model: resolveModel(client, cfg.model),
    methodologyVersion: METHODOLOGY_VERSION,
    usage: { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens },
  };
}

// ---- Implementation Pack v2: per-control engineering artifacts ----
export interface ArtifactControlInput {
  ref: string;
  pillar: number;
  control: string;
  why: string | null;
  requirement: string;
  stackImplementation: string | null;
}

export async function runArtifactsForControls(
  controls: ArtifactControlInput[],
  stack: unknown,
  orgId?: string
): Promise<{ artifacts: ArtifactsOutput["artifacts"]; usage: { inputTokens: number; outputTokens: number } }> {
  const client = await getModelClient(orgId);
  const user =
    `DECLARED TECHNOLOGY STACK:\n${JSON.stringify(stack ?? "(not declared — write generic with TODO markers)", null, 1)}\n\n` +
    `CONTROLS — produce exactly one artifact per control and echo its ref:\n` +
    controls
      .map(
        (c) =>
          `--- ref: ${c.ref}\nPillar ${c.pillar} | requirement: ${c.requirement}\nControl: ${c.control}\nWhy: ${c.why ?? ""}\nIntended implementation: ${c.stackImplementation ?? ""}`
      )
      .join("\n\n");

  const stream = client.messages.stream({
    model: resolveModel(client, ENGINE_MODELS.scaffold),
    max_tokens: 4000,
    system: [{ type: "text", text: ARTIFACTS_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
    tools: [
      {
        name: "submit_assessment",
        description: "Submit exactly one engineering artifact per control.",
        input_schema: ARTIFACTS_TOOL_SCHEMA as Anthropic.Tool["input_schema"],
        cache_control: { type: "ephemeral" },
      },
    ],
    tool_choice: { type: "tool", name: "submit_assessment" },
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "max_tokens") {
    throw new Error("Artifacts output truncated — reduce the batch size");
  }
  const toolUse = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!toolUse) throw new Error("Engine returned no artifacts");
  const parsed = ArtifactsOutput.parse(toolUse.input);
  return {
    artifacts: parsed.artifacts,
    usage: { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens },
  };
}

// ---- Red Team: generate attack paths for a use case (Enterprise) ----
export interface RedTeamInput {
  name: string;
  description: string | null;
  tier: number | null;
  classify: unknown;
  stack: unknown;
  controls: { pillar: number; control: string; status: string; verification_status: string | null }[];
}

export async function runRedTeam(
  uc: RedTeamInput,
  orgId?: string
): Promise<{ attacks: RedTeamOutput["attacks"]; usage: { inputTokens: number; outputTokens: number } }> {
  const client = await getModelClient(orgId);
  const controlList = uc.controls.length
    ? uc.controls.map((c) => `P${c.pillar}: ${c.control}`).join("\n")
    : "(no controls selected yet)";
  const user =
    `USE CASE: ${uc.name}\n\nDESCRIPTION:\n${uc.description ?? "(none)"}\n\n` +
    `RISK TIER: ${uc.tier ?? "(not set)"}\n\n` +
    `CLASSIFICATION (SEE / DECIDE / DO + autonomy):\n${JSON.stringify(uc.classify ?? "(none)", null, 1)}\n\n` +
    `DECLARED STACK:\n${JSON.stringify(uc.stack ?? "(none)", null, 1)}\n\n` +
    `SELECTED CONTROLS (match attacks to these where possible, echoing the control text):\n${controlList}`;

  // Token budget scales with tier: higher tiers produce deeper multi-step
  // chains (and CVP allows more concrete exploitation detail), so give them room.
  const tier = uc.tier ?? 0;
  const maxTokens = tier >= 4 ? 16000 : tier === 3 ? 12000 : 8000;
  const stream = client.messages.stream({
    model: resolveModel(client, ENGINE_MODELS.deep),
    max_tokens: maxTokens,
    system: [{ type: "text", text: RED_TEAM_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
    tools: [
      {
        name: "submit_assessment",
        description: "Submit the red-team attack paths.",
        input_schema: RED_TEAM_TOOL_SCHEMA as Anthropic.Tool["input_schema"],
        cache_control: { type: "ephemeral" },
      },
    ],
    tool_choice: { type: "tool", name: "submit_assessment" },
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "max_tokens") throw new Error("Red Team output truncated");
  const toolUse = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!toolUse) throw new Error("Engine returned no attack paths");
  const parsed = RedTeamOutput.parse(toolUse.input);
  return {
    attacks: parsed.attacks,
    usage: { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens },
  };
}
