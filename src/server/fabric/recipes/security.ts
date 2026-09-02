import type { ProviderRecipe } from "./types";
import { safeJson, pass, fail, guarded, reachable } from "./helpers";

/** SIEM — Splunk satisfies `siem_log_ingestion` (Pillar 9, Monitoring/Evidence):
 *  verify the SIEM is actively ingesting logs. Read-only REST; Neo never reads
 *  event contents, only index metadata. (Replaced CrowdStrike — endpoint EDR
 *  didn't map to a pillar; verification isn't our priority there.) */

export const splunkRecipe: ProviderRecipe = {
  id: "splunk",
  name: "Splunk",
  category: "SIEM",
  accent: "#65a637",
  maturity: "authored_untested",
  summary: "Read-only check that the SIEM is actively ingesting logs — evidence for monitoring.",
  auth: {
    method: "api_token",
    broker: "native",
    scopes: ["read-only REST: server/info, data/indexes"],
    defaults: { scheme: "Bearer" },
    fields: [
      { key: "baseUrl", label: "Splunk REST endpoint", placeholder: "https://<stack>.splunkcloud.com:8089" },
      { key: "token", label: "Authentication token", secret: true, help: "Settings → Tokens (a JWT for a read-only role)" },
    ],
    setup: [
      { title: "Create a read-only auth token", detail: "Splunk → Settings → Tokens → New Token, for a user/role with read on indexes." },
      { title: "Enter the REST endpoint + token", detail: "Cloud: https://<stack>.splunkcloud.com:8089. Neo calls it read-only over TLS, sent as a Bearer token." },
    ],
  },
  async preflight(client) {
    return [await reachable(client, "/services/server/info?output_mode=json", "Token valid + REST reachable")];
  },
  capabilities: [
    {
      capabilityId: "siem_log_ingestion",
      label: "SIEM is ingesting logs (a non-internal index holds events)",
      unlocksControls: ["logging-and-monitoring", "audit-trail"],
      freshnessHours: 24,
      run: (client) => guarded(async () => {
        const res = await client.request("/services/data/indexes?output_mode=json&count=0");
        const j = await safeJson(res);
        const entries = (j?.entry as { name?: string; content?: { totalEventCount?: number | string } }[]) ?? [];
        const live = entries.filter((e) => e.name && !e.name.startsWith("_") && Number(e.content?.totalEventCount ?? 0) > 0);
        return live.length > 0
          ? pass(`${live.length} non-internal index(es) actively holding events.`, { indexes: live.length })
          : fail("No non-internal index is holding events.", "Forward your AI workload logs to a Splunk index (Settings → Data inputs / forwarders).");
      }),
    },
  ],
};

export const siemRecipes = [splunkRecipe];
