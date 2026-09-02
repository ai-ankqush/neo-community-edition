import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { requireSession, requireRole, ApiError } from "@/lib/rbac";
import { supabaseAdmin } from "@/lib/supabase";
import { planFor } from "@/lib/plans";
import { ENGINE_MODELS } from "@/server/methodology/version";
import { recordUsage } from "@/lib/usage";
import { logAudit } from "@/lib/audit";
import { runComposedCheck } from "@/server/composer/run";
import { rollup, type Assertion } from "@/lib/composer";
import { encryptSecret, decryptSecret, hasEncKey, ENC_VERSION } from "@/lib/crypto/secret";

export const maxDuration = 60;

/** POST /api/composer — customer-managed live control verification (Integration Composer).
 *  action "generate" → Ask Neo composes a read-only check (request + assertion + plain-English).
 *  action "save"     → persist the connector (+credential) and the check.
 *  action "run"      → execute the check read-only and roll the result up to the control.
 *  Demo-gated while we validate; credentials must be encrypted at rest before GA. */

const OP = z.enum(["exists", "not_empty", "truthy", "eq", "neq", "gt", "gte", "contains", "matches"]);
const Cond = z.object({
  label: z.string().max(160), path: z.string().max(200), op: OP,
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
  proves: z.enum(["exists", "enabled", "scoped", "configured", "operational"]),
  negate: z.boolean().optional(),
});
const AssertionZ = z.object({ conditions: z.array(Cond).min(1).max(8) });

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate"), systemName: z.string().min(1).max(80), controlText: z.string().min(3).max(4000), baseUrlHint: z.string().max(200).optional(), apiHint: z.string().max(4000).optional() }),
  z.object({
    action: z.literal("save"),
    connectorId: z.string().uuid().optional(),                  // reuse an existing connector (skip creds)
    name: z.string().min(1).max(120), systemName: z.string().min(1).max(80),
    baseUrl: z.string().url().optional(),                       // required only when creating a connector
    authType: z.enum(["api_token", "custom_header", "oauth2_client_credentials"]).optional(),
    credential: z.record(z.string()).default({}),
    useCaseId: z.string().uuid().nullable().optional(), controlItemId: z.string().uuid().nullable().optional(), controlText: z.string().max(4000).optional(),
    method: z.string().default("GET"), path: z.string().max(300).optional(), query: z.record(z.string()).optional(),  // omit path → connector only, no check
    assertion: AssertionZ.optional(), plainSummary: z.string().max(800).optional(),
  }),
  z.object({ action: z.literal("ask"), systemName: z.string().min(1).max(80), question: z.string().min(1).max(1000), context: z.string().max(4000).optional() }),
  z.object({ action: z.literal("test_connector"), connectorId: z.string().uuid() }),
  z.object({ action: z.literal("delete_connector"), connectorId: z.string().uuid() }),
  z.object({ action: z.literal("run"), checkId: z.string().uuid() }),
]);

const ASK_SYSTEM =
  "You are Neo, helping a NON-TECHNICAL customer connect a READ-ONLY integration to one of their systems. " +
  "Answer their question in plain language, assuming they have never opened this system's developer/admin settings. " +
  "Be specific and step-by-step: name the exact page/menu to click, what the thing is called, and what to copy. " +
  "If they ask where to find a token or an id, give the exact navigation path (and the URL/menu). If something they're looking for doesn't exist or isn't needed, say so plainly and tell them what to do instead. " +
  "Everything is READ-ONLY — never suggest write/admin actions, never ask for a password, only read-only API keys/tokens. " +
  "Keep it short and concrete (a few sentences or a short numbered list). If you're unsure of an exact menu name, say so rather than inventing it.";

const GEN_SYSTEM =
  "You are Neo, composing a READ-ONLY live-verification check for a control in a customer's system. " +
  "Output STRICT JSON only (no prose, no markdown). The request MUST be read-only (method GET) and hit the system's own API. " +
  "Compose: a friendly `name`, the `system_name`, the https `base_url` (origin only), `auth_type` (api_token if a static bearer token/API key, custom_header if a named header, oauth2_client_credentials if the system issues SHORT-LIVED tokens via an OAuth token endpoint — e.g. the Azure / Microsoft management & Sentinel APIs, Google Cloud service accounts, many enterprise APIs), a plain-English `auth_help` telling a NON-TECHNICAL user exactly where to get that credential, the `path` (and optional `query`) that lists/reads the control object, and an `assertion` with 1–6 conditions. " +
  "For oauth2_client_credentials, DON'T ask for a raw bearer token (it expires). Instead the `inputs` MUST include: `token_url` (the OAuth token endpoint, e.g. https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token — keep {tenant} as a literal placeholder the customer fills), `client_id` (secret:false), `client_secret` (secret:true), and `scope` (secret:false, e.g. https://management.azure.com/.default), plus any resource ids. Neo will fetch a fresh token itself at check time — explain in preflight how to create an app registration / service principal with READ-ONLY (Reader) access and copy its client id + secret. " +
  "MINIMISE required inputs. Strongly PREFER an endpoint that authenticates with ONLY the token and needs NO resource ids — i.e. an account-level, identity, or list/'meta' endpoint (examples: Airtable `GET /v0/meta/bases`; Notion `GET /v1/users/me`; Datadog `GET /api/v1/validate`; GitHub `GET /user`; Slack `auth.test`). Use such a token-only endpoint whenever it can satisfy the control or a basic connectivity/existence check. Only require an id input (base / workspace / project / account / subscription) when the control genuinely targets ONE specific resource AND no token-only endpoint can prove it. Never ask the user for an id they'd have to hunt for if a token-only endpoint exists. " +
  "If the system's primary interface is IaC/CLI rather than a SaaS app (e.g. Terraform, Pulumi, Ansible), target the vendor's MANAGEMENT API instead (e.g. Terraform Cloud/Enterprise API at app.terraform.io) and its documented read endpoint. NEVER refuse — always produce a best-effort read-only check against the most relevant documented API. " +
  "List EVERY value the customer must provide as `inputs`: an array of {`key` (snake_case), `label` (plain English), `help` (where to get it), `secret` (true for tokens/keys/secrets, false for ids like subscription/account/organization/workspace/resource-group/region), `example`?}. The token/key MUST be one input with secret:true. If the endpoint needs ids (e.g. Azure subscription id + resource group + workspace), include one input PER id with secret:false. Reference each non-secret input in `base_url`/`path`/`query` with a {key} placeholder that exactly matches its `key` (e.g. /subscriptions/{subscription_id}/resourceGroups/{resource_group}/...). `base_url` is the ORIGIN only (no placeholders); put id placeholders in `path`/`query`. The number of inputs MUST match what your instructions ask for — never ask for an id in the steps without also adding it to `inputs`. " +
  "Also compose a `preflight`: a `vendor_url` (the system's website or admin console where the user goes to get a read-only key — e.g. https://airtable.com), and `steps` (2–5 short, dead-simple, ordered instructions listing exactly WHAT the customer needs and WHERE to get each item — every item must correspond to an `inputs` entry — naming the exact menu/page, saying to choose read-only/least-privilege scope, and what to copy). Assume the user has never seen this system's settings. " +
  "Each condition: a plain-English `label`, a `path` (dot path into the JSON response, supports [*] for any element), an `op`, optional `value`, optional `negate`, and `proves` (exists | enabled | scoped | configured | operational). " +
  "Write the `plain_summary` as 'Neo will check whether …' in plain language a compliance manager understands. Never invent endpoints you're unsure of — prefer the system's documented list/search endpoint. " +
  'JSON shape: {"name","system_name","base_url","auth_type","auth_help","inputs":[{"key","label","help","secret","example"?}],"preflight":{"vendor_url","steps":["…"]},"path","query"?,"assertion":{"conditions":[{"label","path","op","value"?,"negate"?,"proves"}]},"plain_summary"}';

const OPS = ["exists", "not_empty", "truthy", "eq", "neq", "gt", "gte", "contains", "matches"];
const PROVES = ["exists", "enabled", "scoped", "configured", "operational"];

/** Pull the JSON object out of a model reply (strip prose / markdown fences). */
function extractJson(raw: string): unknown {
  let s = (raw ?? "").trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  try { return JSON.parse(s); } catch { return null; }
}

type ConnInput = { key: string; label: string; help?: string; secret: boolean; example?: string };
type AuthType = "api_token" | "custom_header" | "oauth2_client_credentials";
type NormProposal = {
  name: string; system_name: string; base_url: string; auth_type: AuthType;
  auth_help: string; inputs: ConnInput[]; preflight: { vendor_url?: string; steps: string[] };
  path: string; query?: Record<string, string>; assertion: z.infer<typeof AssertionZ>; plain_summary: string;
};

/** Coerce whatever the model returned into a usable proposal, filling safe defaults.
 *  Never throws — build must always proceed; the customer can fix base_url in the UI. */
function normalizeProposal(input: unknown, systemName: string): NormProposal {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const pfRaw = (o.preflight && typeof o.preflight === "object" ? o.preflight : {}) as Record<string, unknown>;

  // base_url → https origin; fall back to the vendor_url origin if the API base is missing/bad
  let base = String(o.base_url ?? "").trim();
  const tryOrigin = (u: string) => { try { return new URL(u).origin; } catch { return ""; } };
  if (!/^https?:\/\//i.test(base)) {
    const vu = String(pfRaw.vendor_url ?? "");
    base = /^https?:\/\//i.test(vu) ? tryOrigin(vu) : "";
  } else base = tryOrigin(base);

  const condsRaw = Array.isArray((o.assertion as Record<string, unknown>)?.conditions)
    ? ((o.assertion as Record<string, unknown>).conditions as Record<string, unknown>[]) : [];
  let conditions = condsRaw
    .filter((c) => c && typeof c.path === "string" && (c.path as string).length > 0)
    .map((c) => ({
      label: String(c.label ?? "The control object exists").slice(0, 160),
      path: String(c.path).slice(0, 200),
      op: (OPS.includes(c.op as string) ? c.op : "exists") as string,
      ...(typeof c.value === "string" || typeof c.value === "number" || typeof c.value === "boolean" ? { value: c.value } : {}),
      ...(typeof c.negate === "boolean" ? { negate: c.negate } : {}),
      proves: (PROVES.includes(c.proves as string) ? c.proves : "exists") as string,
    }));
  if (conditions.length === 0) conditions = [{ label: "The control object exists and is returned", path: "$", op: "exists", proves: "exists" }];

  let path = String(o.path ?? "/").trim();
  if (!path.startsWith("/")) path = "/" + path;

  const steps = Array.isArray(pfRaw.steps) ? (pfRaw.steps as unknown[]).filter((s) => typeof s === "string").map((s) => s as string).slice(0, 6) : [];
  const auth_type: AuthType = o.auth_type === "custom_header" ? "custom_header"
    : o.auth_type === "oauth2_client_credentials" ? "oauth2_client_credentials" : "api_token";

  // inputs — every value the customer must supply (token + ids). Guarantee the right credential fields.
  const inputs: ConnInput[] = (Array.isArray(o.inputs) ? (o.inputs as Record<string, unknown>[]) : [])
    .filter((x) => x && typeof x.key === "string" && (x.key as string).length > 0)
    .map((x) => ({
      key: String(x.key).slice(0, 40).replace(/[^a-zA-Z0-9_]/g, "_"),
      label: String(x.label ?? x.key).slice(0, 80),
      help: typeof x.help === "string" ? x.help.slice(0, 300) : undefined,
      secret: Boolean(x.secret),
      example: typeof x.example === "string" ? x.example.slice(0, 80) : undefined,
    }))
    .slice(0, 10);
  const ensure = (key: string, label: string, secret: boolean, example?: string) => { if (!inputs.some((i) => i.key === key)) inputs.push({ key, label, secret, example }); };
  if (auth_type === "oauth2_client_credentials") {
    ensure("token_url", "Token URL", false, "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token");
    ensure("client_id", "Client / application ID", false);
    ensure("client_secret", "Client secret (read-only)", true);
    ensure("scope", "Scope", false, "https://management.azure.com/.default");
  } else if (auth_type === "custom_header") {
    if (!inputs.some((i) => i.key === "header_name")) inputs.unshift({ key: "header_name", label: "Header name", secret: false, example: "Authorization" });
    if (!inputs.some((i) => i.secret)) inputs.push({ key: "header_value", label: "Header value (read-only key)", secret: true });
  } else if (!inputs.some((i) => i.secret)) {
    inputs.push({ key: "token", label: "Read-only API token", secret: true });
  }

  return {
    name: String(o.name ?? `${systemName} check`).slice(0, 120),
    system_name: String(o.system_name ?? systemName).slice(0, 80),
    base_url: base,
    auth_type,
    auth_help: String(o.auth_help ?? `Paste a read-only API token for ${systemName}. Neo only ever reads.`).slice(0, 800),
    inputs,
    preflight: { vendor_url: typeof pfRaw.vendor_url === "string" ? pfRaw.vendor_url : undefined, steps },
    path,
    query: o.query && typeof o.query === "object" ? (o.query as Record<string, string>) : undefined,
    assertion: AssertionZ.parse({ conditions: conditions.slice(0, 8) }),
    plain_summary: String(o.plain_summary ?? `Neo will read ${systemName} and check whether the control exists.`).slice(0, 800),
  };
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const sb = supabaseAdmin();
    // Integration Composer is available on every plan (integrations entitlement is universal).
    const { data: org } = await sb.from("organizations").select("plan, is_demo").eq("id", session.internalOrgId).single();
    if (!(planFor(org?.plan).integrations || org?.is_demo)) throw new ApiError(403, "Neo Integration Composer isn't available on your plan.");
    const b = Body.parse(await req.json());

    if (b.action === "generate") {
      // Build must always proceed. If the model errors or returns junk, we still hand back a
      // normalized proposal (the customer can fill/fix the base URL in the build step).
      let parsed: unknown = null;
      try {
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const msg = await client.messages.create({
          model: ENGINE_MODELS.fast, max_tokens: 3000, system: GEN_SYSTEM,
          messages: [{ role: "user", content: `SYSTEM: ${b.systemName}\nCONTROL TO VERIFY: ${b.controlText}\n${b.baseUrlHint ? `BASE URL HINT: ${b.baseUrlHint}\n` : ""}${b.apiHint ? `API REFERENCE (use this):\n${b.apiHint}\n` : ""}\nReturn ONLY the JSON object, no prose, no markdown.` }],
        });
        await recordUsage(session.internalOrgId, msg.usage.input_tokens, msg.usage.output_tokens);
        const raw = msg.content.filter((x) => x.type === "text").map((x) => (x as { text: string }).text).join("");
        parsed = extractJson(raw);
      } catch (e) {
        console.error("COMPOSER generate model error", e);
      }
      const proposal = normalizeProposal(parsed, b.systemName);
      return NextResponse.json({ proposal });
    }

    if (b.action === "ask") {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const msg = await client.messages.create({
        model: ENGINE_MODELS.fast, max_tokens: 700, system: ASK_SYSTEM,
        messages: [{ role: "user", content: `SYSTEM: ${b.systemName}\n${b.context ? `WHAT NEO IS SETTING UP:\n${b.context}\n` : ""}\nCUSTOMER QUESTION: ${b.question}` }],
      });
      await recordUsage(session.internalOrgId, msg.usage.input_tokens, msg.usage.output_tokens);
      const answer = msg.content.filter((x) => x.type === "text").map((x) => (x as { text: string }).text).join("").trim();
      return NextResponse.json({ answer: answer || "Sorry — I couldn't work that out. Try rephrasing, or describe what you're stuck on." });
    }

    // mutations require admin
    await requireRole("org_admin");

    if (b.action === "save") {
      // Either reuse an existing connector, or create one (org-level, control-independent).
      let connectorId = b.connectorId ?? null;
      if (connectorId) {
        const { data: own } = await sb.from("ai_custom_connectors").select("id").eq("org_id", session.internalOrgId).eq("id", connectorId).maybeSingle();
        if (!own) throw new ApiError(404, "Connector not found.");
      } else {
        if (!b.baseUrl || !b.authType) throw new ApiError(400, "A new connector needs a base URL and auth type.");
        if (!hasEncKey()) throw new ApiError(503, "Secure credential storage isn't configured on this environment yet. Set COMPOSER_ENC_KEY.");
        const host = new URL(b.baseUrl).hostname;
        const { data: conn, error: connErr } = await sb.from("ai_custom_connectors").insert({
          org_id: session.internalOrgId, name: b.name, system_name: b.systemName, base_url: b.baseUrl, host,
          auth_type: b.authType, credential_enc: encryptSecret(b.credential), enc_version: ENC_VERSION, created_by: session.userId,
        }).select("id").single();
        if (connErr || !conn) throw new ApiError(500, `Couldn't save the connector: ${connErr?.message ?? "unknown error"}. If this mentions credential_enc/enc_version, run migration 0047.`);
        connectorId = conn.id;
      }

      // A check is optional — omit path/assertion to just add a connector for later use.
      let checkId: string | null = null;
      if (b.path && b.assertion) {
        const { data: check, error: checkErr } = await sb.from("ai_custom_checks").insert({
          org_id: session.internalOrgId, connector_id: connectorId, use_case_id: b.useCaseId ?? null, control_item_id: b.controlItemId ?? null,
          control_text: b.controlText ?? null, method: "GET", path: b.path, query: b.query ?? null, assertion: b.assertion, plain_summary: b.plainSummary ?? null,
          created_by: session.userId,
        }).select("id").single();
        if (checkErr || !check) throw new ApiError(500, `Couldn't save the check: ${checkErr?.message ?? "unknown error"}.`);
        checkId = check.id;
      }
      await logAudit({ orgId: session.internalOrgId, actor: session.userId, action: "composer.save", detail: { system: b.systemName, reused: Boolean(b.connectorId), check: Boolean(checkId) } });
      return NextResponse.json({ ok: true, connectorId, checkId });
    }

    if (b.action === "test_connector") {
      if (!hasEncKey()) throw new ApiError(503, "Secure credential storage isn't configured on this environment yet. Set COMPOSER_ENC_KEY.");
      const { data: connector } = await sb.from("ai_custom_connectors").select("base_url, host, auth_type, credential_enc").eq("org_id", session.internalOrgId).eq("id", b.connectorId).single();
      if (!connector) throw new ApiError(404, "Connector not found.");
      let credential: Record<string, string> | null = null;
      try { credential = connector.credential_enc ? decryptSecret(connector.credential_enc as string) : null; }
      catch { throw new ApiError(500, "Couldn't read this connector's stored credential. Re-create the connector."); }

      // read-only smoke check: hit the API root with the key and report whether we reached it
      const result = await runComposedCheck(
        { base_url: connector.base_url as string, host: connector.host as string, auth_type: connector.auth_type as string, credential },
        { method: "GET", path: "/", query: null, assertion: { conditions: [{ label: "Reachable", path: "$", op: "exists", proves: "operational" }] } as Assertion },
      );
      const s = result.httpStatus;
      const reachable = s > 0;
      const authRejected = s === 401 || s === 403;
      const message = !reachable
        ? (result.summary || "Neo couldn't reach the system.")
        : authRejected
          ? `Reached ${connector.host}, but the read-only key was rejected (HTTP ${s}). Check the token and its read-only scopes.`
          : `Reached ${connector.host} and your read-only key was accepted (HTTP ${s}). The connector is live.`;
      await logAudit({ orgId: session.internalOrgId, actor: session.userId, action: "composer.test", detail: { httpStatus: s } });
      return NextResponse.json({ ok: reachable && !authRejected, reachable, authRejected, httpStatus: s, message });
    }

    if (b.action === "delete_connector") {
      // collect bound controls before the cascade delete, so we can reset their live status
      const { data: chks } = await sb.from("ai_custom_checks").select("control_item_id").eq("org_id", session.internalOrgId).eq("connector_id", b.connectorId);
      const controlIds = [...new Set((chks ?? []).map((c) => c.control_item_id as string | null).filter((x): x is string => Boolean(x)))];
      // delete the connector — cascades to its checks AND removes the encrypted credential
      const { error: delErr } = await sb.from("ai_custom_connectors").delete().eq("org_id", session.internalOrgId).eq("id", b.connectorId);
      if (delErr) throw new ApiError(500, `Couldn't remove the connector: ${delErr.message}`);
      // a control that was live-verified by this connector is no longer proven
      if (controlIds.length) {
        await sb.from("control_items").update({
          verification_status: "missing", verification_note: "Live verification removed — connector deleted.", verified_at: null,
        }).eq("org_id", session.internalOrgId).in("id", controlIds);
      }
      await logAudit({ orgId: session.internalOrgId, actor: session.userId, action: "composer.delete", detail: { connectorId: b.connectorId, controlsReset: controlIds.length } });
      return NextResponse.json({ ok: true });
    }

    // action "run"
    const { data: check } = await sb.from("ai_custom_checks").select("id, connector_id, control_item_id, method, path, query, assertion").eq("org_id", session.internalOrgId).eq("id", b.checkId).single();
    if (!check) throw new ApiError(404, "Check not found.");
    const { data: connector } = await sb.from("ai_custom_connectors").select("base_url, host, auth_type, credential_enc").eq("org_id", session.internalOrgId).eq("id", check.connector_id).single();
    if (!connector) throw new ApiError(404, "Connector not found.");
    if (!hasEncKey()) throw new ApiError(503, "Secure credential storage isn't configured on this environment yet. Set COMPOSER_ENC_KEY.");

    // decrypt the read-only credential in memory only — never logged, never returned
    let credential: Record<string, string> | null = null;
    try { credential = connector.credential_enc ? decryptSecret(connector.credential_enc as string) : null; }
    catch { throw new ApiError(500, "Couldn't read this connector's stored credential. Re-create the connector."); }

    const result = await runComposedCheck(
      { base_url: connector.base_url as string, host: connector.host as string, auth_type: connector.auth_type as string, credential },
      { method: check.method as string, path: check.path as string, query: (check.query as Record<string, string>) ?? null, assertion: check.assertion as Assertion },
    );
    const roll = rollup(result.state);
    const expires = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(); // 30-day freshness

    await sb.from("ai_custom_checks").update({
      last_state: result.state, last_rollup: roll, last_findings: result.findings, last_run_at: new Date().toISOString(), expires_at: expires, updated_at: new Date().toISOString(),
    }).eq("id", check.id);

    // roll the result up to the bound control (only verified/partial/missing — never from an ambiguous pass)
    if (check.control_item_id && roll !== "na") {
      await sb.from("control_items").update({
        verification_status: roll, verification_note: `Live-verified via customer connector: ${result.summary}`,
        verified_at: roll === "verified" ? new Date().toISOString() : null,
      }).eq("org_id", session.internalOrgId).eq("id", check.control_item_id);
    }
    await logAudit({ orgId: session.internalOrgId, actor: session.userId, action: "composer.run", detail: { state: result.state } });
    return NextResponse.json({ ok: true, state: result.state, rollup: roll, summary: result.summary, findings: result.findings, httpStatus: result.httpStatus });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error("COMPOSER ERROR", err);
    const msg = err instanceof Error ? err.message : "Composer request failed";
    return NextResponse.json({ error: `Composer request failed: ${msg}` }, { status: 500 });
  }
}
