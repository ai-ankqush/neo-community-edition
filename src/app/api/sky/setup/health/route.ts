import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getModelClient, resolveModel } from "@/server/model/provider";
import { ENGINE_MODELS } from "@/server/methodology/version";
import { getAuthContext } from "@/server/identity/auth-context";
import type Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Check = { ok: boolean; detail: string };

async function checkDb(): Promise<Check> {
  try {
    const { error } = await supabaseAdmin().from("organizations").select("id", { count: "exact", head: true }).limit(1);
    if (error) return { ok: false, detail: error.message || "query failed" };
    return { ok: true, detail: "Connected" };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "not reachable" };
  }
}

async function checkJobs(): Promise<Check> {
  if (process.env.INNGEST_EVENT_KEY) return { ok: true, detail: "Inngest Cloud configured" };
  const url = process.env.INNGEST_DEV || process.env.INNGEST_BASE_URL || "http://127.0.0.1:8288";
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(2500) });
    // Any HTTP response means the dev server is up (it serves a UI + API on that port).
    return { ok: r.status < 500, detail: `Job runner reachable at ${url}` };
  } catch {
    return { ok: false, detail: `Job runner not reachable at ${url} — start it: npx inngest-cli dev` };
  }
}

async function checkModel(orgId: string | null): Promise<Check> {
  try {
    const client = await getModelClient(orgId);
    const provider = (process.env.MODEL_PROVIDER ?? "").toLowerCase() === "bedrock" ? "Amazon Bedrock" : "Anthropic API";
    await (client as Anthropic).messages.create({
      model: resolveModel(client, ENGINE_MODELS.fast),
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    });
    return { ok: true, detail: `${provider} key valid` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Common, actionable cases first.
    if (/x-api-key|authentication/i.test(msg)) return { ok: false, detail: "Model key rejected (check ANTHROPIC_API_KEY / Bedrock access)" };
    if (/ANTHROPIC_API_KEY|apiKey/i.test(msg)) return { ok: false, detail: "No model key set — add ANTHROPIC_API_KEY (or MODEL_PROVIDER=bedrock) to .env" };
    return { ok: false, detail: msg.slice(0, 200) };
  }
}

/**
 * GET /api/sky/setup/health — for the first-run onboarding screen. Reports DB,
 * background-job runner, and model-provider status. Allowed only during setup
 * (no users yet) or to a signed-in admin, so it can't be used to ping the model
 * anonymously on a live instance.
 */
export async function GET() {
  const { data: anyUser } = await supabaseAdmin().from("sky_users").select("user_id").limit(1).maybeSingle();
  const hasUsers = !!anyUser;
  let orgId: string | null = null;
  if (hasUsers) {
    const { orgRole, internalOrgId } = await getAuthContext();
    if (!orgRole || !orgRole.includes("admin")) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    orgId = internalOrgId; // test THIS org's key (stored in-app, or the env default)
  }

  const [db, jobs, model] = await Promise.all([checkDb(), checkJobs(), checkModel(orgId)]);
  const allOk = db.ok && jobs.ok && model.ok;
  return NextResponse.json({ ok: allOk, checks: { db, jobs, model } });
}
