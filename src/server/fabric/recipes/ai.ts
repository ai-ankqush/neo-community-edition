import type { ProviderRecipe } from "./types";
import { safeJson, pass, fail, guarded, reachable } from "./helpers";

/** AI-layer connectors (roadmap, authored_untested, gated until live-validated).
 *  Read-only inventory/telemetry checks against documented APIs. These verify the
 *  model/agent layer itself — distinct from the cloud/identity connectors. */

export const openaiRecipe: ProviderRecipe = {
  id: "openai",
  name: "OpenAI",
  category: "AI Platform",
  accent: "#10a37f",
  maturity: "verified",
  summary: "Read-only check that the OpenAI platform is reachable and enumerate the models the key can access.",
  auth: {
    method: "api_token",
    broker: "native",
    scopes: ["read-only: GET /v1/models"],
    defaults: { baseUrl: "https://api.openai.com", scheme: "Bearer" },
    fields: [
      { key: "token", label: "API key", secret: true, placeholder: "sk-…", help: "platform.openai.com → API keys (a read-capable key)" },
    ],
    setup: [
      { title: "Create an API key", detail: "platform.openai.com → API keys → Create. A standard key is fine; Neo only calls GET /v1/models.", link: "https://platform.openai.com/api-keys" },
      { title: "Paste the key", detail: "Neo lists the models available to the key as Pillar 1 inventory. Read-only." },
    ],
  },
  async preflight(client) {
    return [await reachable(client, "/v1/models", "API key valid + OpenAI reachable")];
  },
  capabilities: [
    {
      capabilityId: "ai_platform_inventory",
      label: "Models the key can access are enumerated",
      unlocksControls: ["ai-inventory", "model-inventory"],
      freshnessHours: 168,
      run: (client) => guarded(async () => {
        const res = await client.request("/v1/models");
        const j = await safeJson(res);
        const models = (j?.data as { id?: string }[]) ?? [];
        return models.length > 0
          ? pass(`${models.length} OpenAI model(s) accessible to this key.`, { models: models.length })
          : fail("No models returned for this key.", "Confirm the API key is active and has model access.");
      }),
    },
  ],
};

export const anthropicRecipe: ProviderRecipe = {
  id: "anthropic",
  name: "Anthropic",
  category: "AI Platform",
  accent: "#d97757",
  maturity: "verified",
  summary: "Read-only check that the Anthropic platform is reachable and enumerate the Claude models the key can access.",
  auth: {
    method: "api_token",
    broker: "native",
    scopes: ["read-only: GET /v1/models"],
    // x-api-key header + required anthropic-version header (no Authorization, no scheme prefix)
    defaults: { baseUrl: "https://api.anthropic.com", authHeaderName: "x-api-key", staticHeaders: JSON.stringify({ "anthropic-version": "2023-06-01" }) },
    fields: [
      { key: "token", label: "API key", secret: true, placeholder: "sk-ant-…", help: "console.anthropic.com → API keys" },
    ],
    setup: [
      { title: "Create an API key", detail: "console.anthropic.com → Settings → API keys → Create key.", link: "https://console.anthropic.com/settings/keys" },
      { title: "Paste the key", detail: "Neo lists the Claude models available to the key as Pillar 1 inventory. Read-only." },
    ],
  },
  async preflight(client) {
    return [await reachable(client, "/v1/models", "API key valid + Anthropic reachable")];
  },
  capabilities: [
    {
      capabilityId: "ai_platform_inventory",
      label: "Claude models the key can access are enumerated",
      unlocksControls: ["ai-inventory", "model-inventory"],
      freshnessHours: 168,
      run: (client) => guarded(async () => {
        const res = await client.request("/v1/models");
        const j = await safeJson(res);
        const models = (j?.data as { id?: string }[]) ?? [];
        return models.length > 0
          ? pass(`${models.length} Anthropic model(s) accessible to this key.`, { models: models.length })
          : fail("No models returned for this key.", "Confirm the API key is active.");
      }),
    },
  ],
};

export const langsmithRecipe: ProviderRecipe = {
  id: "langsmith",
  name: "LangSmith",
  category: "Observability",
  accent: "#1c3c3c",
  maturity: "verified",
  summary: "Read-only check that agent traces/projects exist in LangSmith — evidence the agent layer is observable.",
  auth: {
    method: "api_token",
    broker: "native",
    scopes: ["read-only: GET /api/v1/sessions"],
    defaults: { baseUrl: "https://api.smith.langchain.com", authHeaderName: "x-api-key" },
    fields: [
      { key: "token", label: "API key", secret: true, placeholder: "lsv2_…", help: "smith.langchain.com → Settings → API keys" },
    ],
    setup: [
      { title: "Create an API key", detail: "smith.langchain.com → Settings → API keys → Create.", link: "https://smith.langchain.com/settings" },
      { title: "Paste the key", detail: "Neo checks that tracing projects exist. Read-only; trace contents are not read." },
    ],
  },
  async preflight(client) {
    return [await reachable(client, "/api/v1/sessions?limit=1", "API key valid + LangSmith reachable")];
  },
  capabilities: [
    {
      capabilityId: "agent_tracing_enabled",
      label: "Tracing projects exist (agents are being traced)",
      unlocksControls: ["logging-and-monitoring", "agent-observability"],
      freshnessHours: 24,
      run: (client) => guarded(async () => {
        const res = await client.request("/api/v1/sessions?limit=20");
        const j = await safeJson(res);
        // LangSmith returns an array of sessions (tracing projects)
        const sessions = Array.isArray(j) ? j : ((j?.sessions as unknown[]) ?? []);
        return sessions.length > 0
          ? pass(`${sessions.length} LangSmith tracing project(s) found.`, { projects: sessions.length })
          : fail("No tracing projects found.", "Send agent traces to LangSmith (set LANGCHAIN_TRACING_V2=true and a project).");
      }),
    },
  ],
};

export const aiRecipes = [openaiRecipe, anthropicRecipe, langsmithRecipe];
