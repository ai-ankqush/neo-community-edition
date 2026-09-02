import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { getAuthContext } from "@/server/identity/auth-context";
import { getModelClient, resolveModel } from "@/server/model/provider";
import { ENGINE_MODELS } from "@/server/methodology/version";
import { recordUsageEvent } from "@/lib/usage";

export const dynamic = "force-dynamic";

const Body = z.object({ text: z.string().min(2).max(2000), useCaseId: z.string().optional() });

const CAPS = ["identity", "edr", "siem", "cloud", "data", "network", "ai_platform", "agent_framework", "itsm", "grc", "code", "other"] as const;

const Candidate = z.object({
  vendor: z.string(),
  product: z.string(),
  capability: z.enum(CAPS),
  confidence: z.enum(["high", "medium", "low"]),
  note: z.string().default(""),
});
const Output = z.object({ candidates: z.array(Candidate).max(24) });

const SYSTEM = `You identify the security, IT, identity, cloud, data, networking, and AI products in a company's technology stack from free-text input. Input may be product names (possibly misspelled), vendor names, or a description of what they use.

For every product you recognize — including niche, regional, or internal-sounding ones — return a candidate. Recognize products even if they are not well known.

If a vendor spans multiple capabilities (e.g. CrowdStrike, Microsoft Defender, Okta, Microsoft Entra, Palo Alto, Zscaler, ServiceNow), return EACH distinct module the user might mean as a SEPARATE candidate, so they can pick the right one. Do NOT invent products the input doesn't imply. If a token is too vague to identify, skip it.

For each candidate provide: vendor (company), product (the specific module/product a practitioner would recognize), capability (one of: identity, edr, siem, cloud, data, network, ai_platform, agent_framework, itsm, grc, code, other), confidence (high/medium/low), and note (a clarifier under 12 words of what it does). Return all candidates via the tool.`;

const TOOL = {
  name: "report_products",
  description: "Return the identified product candidates.",
  input_schema: {
    type: "object",
    properties: {
      candidates: {
        type: "array",
        items: {
          type: "object",
          properties: {
            vendor: { type: "string" },
            product: { type: "string" },
            capability: { type: "string", enum: CAPS },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            note: { type: "string" },
          },
          required: ["vendor", "product", "capability", "confidence"],
        },
      },
    },
    required: ["candidates"],
  },
} as const;

export async function POST(req: NextRequest) {
  try {
    const { userId, internalOrgId } = await getAuthContext();
    if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { text, useCaseId } = Body.parse(await req.json());

    // BYO-key aware: routes to the org's own key in Community Edition, the
    // managed platform key otherwise (identical to prior behavior).
    const client = await getModelClient(internalOrgId);
    const msg = await client.messages.create({
      model: resolveModel(client, ENGINE_MODELS.fast),
      max_tokens: 2000,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `Identify the products in this stack input:\n\n${text}` }],
      tools: [{ ...TOOL, cache_control: { type: "ephemeral" } } as Anthropic.Tool],
      tool_choice: { type: "tool", name: "report_products" },
    });

    const toolUse = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const parsed = toolUse ? Output.parse(toolUse.input) : { candidates: [] };

    if (internalOrgId) {
      await recordUsageEvent(internalOrgId, { useCaseId: useCaseId ?? null, stage: "stack_identify", model: ENGINE_MODELS.fast, inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens });
    }

    return NextResponse.json({ candidates: parsed.candidates });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error("STACK IDENTIFY ERROR", err);
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    return NextResponse.json({ error: "Could not identify products", detail }, { status: 500 });
  }
}
