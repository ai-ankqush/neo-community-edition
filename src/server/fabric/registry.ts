import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { getCapability } from "./capabilities";
import { githubConnector } from "./connectors/github";
import { recordEvidence } from "./evidence";
import { getRecipe, runRecipeCheck } from "./recipes/registry";
import type { Connector, OrgConnection, CheckResult } from "./types";

/** Provider → native connector. GitHub predates the recipe framework and keeps
 *  its dedicated App connector; all other providers resolve via recipes. */
const CONNECTORS: Record<string, Connector> = {
  github: githubConnector,
};

export function connectorFor(provider: string): Connector | null {
  return CONNECTORS[provider] ?? null;
}

/** Run a capability check for an org/use-case and persist the result as evidence.
 *  Picks the first provider for the capability that the org has connected. */
export async function runCapabilityCheck(input: {
  orgId: string;
  capabilityId: string;
  useCaseId?: string | null;
  controlId?: string | null;
  actor: string;
  params?: Record<string, unknown>;
}): Promise<{ check: CheckResult; evidenceId: string | null; provider: string }> {
  const cap = getCapability(input.capabilityId);
  if (!cap) {
    return { check: { result: "error", note: `Unknown capability ${input.capabilityId}` }, evidenceId: null, provider: "" };
  }

  let connection: OrgConnection | null = null;
  let provider = "";
  for (const p of cap.providers) {
    const { data } = await supabaseAdmin()
      .from("org_connections")
      .select("id, provider, label, status, credential")
      .eq("org_id", input.orgId).eq("provider", p).eq("status", "connected")
      .limit(1).maybeSingle();
    if (data) { connection = data as OrgConnection; provider = p; break; }
  }
  if (!connection) {
    return {
      check: {
        result: "error",
        note: `No connected ${cap.providers.join(" / ")} for ${cap.label}.`,
        remediationHint: `Connect a ${cap.providers[0]} in Settings → Connections.`,
      },
      evidenceId: null,
      provider: "",
    };
  }

  let check: CheckResult;
  const connector = connectorFor(provider);
  if (connector) {
    check = await connector.check(input.capabilityId, input.params ?? {}, { orgId: input.orgId, connection });
  } else {
    const recipe = getRecipe(provider);
    check = recipe
      ? await runRecipeCheck(recipe, input.capabilityId, (connection.credential ?? {}) as Record<string, unknown>, input.params ?? {})
      : { result: "error", note: `No connector or recipe for provider ${provider}` };
  }
  const { id } = await recordEvidence({
    orgId: input.orgId,
    useCaseId: input.useCaseId ?? null,
    controlId: input.controlId ?? null,
    capabilityId: input.capabilityId,
    provider,
    actor: input.actor,
    check,
  });
  return { check, evidenceId: id, provider };
}
