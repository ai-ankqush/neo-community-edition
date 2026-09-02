import type { ProviderRecipe } from "./types";
import { safeJson, pass, fail, guarded, reachable } from "./helpers";

/** Cloud providers — read-only posture checks. Auth: AWS assume-role (SigV4),
 *  GCP service-account JWT, Azure OAuth2 client-credentials. authored_untested. */

export const awsRecipe: ProviderRecipe = {
  id: "aws",
  name: "AWS",
  category: "Cloud",
  accent: "#ff9900",
  maturity: "verified",
  summary: "Read-only checks for audit logging and model-endpoint guardrails across your AWS account.",
  auth: {
    method: "aws_role",
    broker: "native",
    scopes: ["read-only (SecurityAudit + Enhanced Bedrock supplemental)"],
    fields: [
      { key: "roleArn", label: "Role ARN", placeholder: "arn:aws:iam::123456789012:role/NeoControlReadOnlyVerifierRole" },
      { key: "externalId", label: "External ID", help: "From the Trust Template output", secret: true },
      { key: "region", label: "Primary region", placeholder: "us-east-1", optional: true },
    ],
    setup: [
      { title: "Deploy the Neo read-only role", detail: "Run the CloudFormation/Terraform Trust Template — it creates an IAM role that trusts Neo's account with an external id, scoped to read-only.", link: "neo-aws-readonly-role.yaml" },
      { title: "Copy the role ARN + external id", detail: "From the stack outputs. Neo stores these (the external id is the shared secret); no access keys are stored." },
      { title: "Enter region", detail: "Your primary region (where CloudTrail / model endpoints live)." },
    ],
  },
  trustTemplate: { iac: "cloudformation", filename: "neo-aws-readonly-role.yaml", note: "Creates a read-only IAM role trusting Neo with an external id." },
  async preflight(client, cred) {
    const region = String(cred.region ?? "us-east-1");
    return [await reachable(client, `https://sts.${region}.amazonaws.com/?Action=GetCallerIdentity&Version=2011-06-15`, "Assume-role + STS identity")];
  },
  capabilities: [
    {
      capabilityId: "cloud_audit_logging_enabled",
      label: "CloudTrail audit logging enabled",
      unlocksControls: ["logging-and-monitoring", "audit-trail"],
      freshnessHours: 24,
      run: (client, cred) => guarded(async () => {
        const region = String(cred.region ?? "us-east-1");
        const res = await client.request(`https://cloudtrail.${region}.amazonaws.com/`, {
          method: "POST",
          headers: { "X-Amz-Target": "com.amazonaws.cloudtrail.v20131101.CloudTrail_20131101.DescribeTrails", "Content-Type": "application/x-amz-json-1.1" },
          body: "{}",
        });
        const j = await safeJson(res);
        const trails = (j?.trailList as { IsMultiRegionTrail?: boolean; Name?: string }[]) ?? [];
        if (trails.length === 0) return fail("No CloudTrail trails found.", "Enable a multi-region CloudTrail trail.");
        const multi = trails.some((t) => t.IsMultiRegionTrail);
        return multi
          ? pass(`${trails.length} trail(s), multi-region logging on.`, { trails: trails.length })
          : fail("Trails exist but none are multi-region.", "Enable multi-region on at least one trail.");
      }),
    },
    {
      // Enhanced mode (Bedrock supplemental policy). Enumerates the account's Bedrock AI footprint
      // — available foundation models, customer custom models, and guardrails — as inventory evidence.
      capabilityId: "ai_platform_inventory",
      label: "Bedrock AI inventory (models, custom models, guardrails)",
      unlocksControls: ["ai-inventory", "model-inventory"],
      freshnessHours: 168,
      run: (client, cred) => guarded(async () => {
        const region = String(cred.region ?? "us-east-1");
        const fmRes = await client.request(`https://bedrock.${region}.amazonaws.com/foundation-models`);
        if (fmRes.status === 403) {
          return fail(
            "Role can reach AWS but lacks bedrock:ListFoundationModels.",
            "Redeploy the Neo role with VerificationMode=Enhanced (adds the Bedrock read-only supplemental policy).",
          );
        }
        const fm = await safeJson(fmRes);
        const foundation = ((fm?.modelSummaries as unknown[]) ?? []).length;
        const cm = await safeJson(await client.request(`https://bedrock.${region}.amazonaws.com/custom-models`));
        const custom = ((cm?.modelSummaries as unknown[]) ?? []).length;
        const gr = await safeJson(await client.request(`https://bedrock.${region}.amazonaws.com/guardrails`));
        const guardrails = ((gr?.guardrails as unknown[]) ?? []).length;
        const evidence = { region, foundationModels: foundation, customModels: custom, guardrails };
        return foundation === 0 && custom === 0
          ? pass(`No Bedrock footprint in ${region} (region not enabled for Bedrock, or no models). Try the region hosting your usage.`, evidence)
          : pass(`Bedrock inventory in ${region}: ${foundation} foundation model(s), ${custom} custom, ${guardrails} guardrail(s).`, evidence);
      }),
    },
    {
      capabilityId: "threat_detection_enabled",
      label: "GuardDuty threat detection enabled",
      unlocksControls: ["threat-detection", "logging-and-monitoring"],
      freshnessHours: 24,
      run: (client, cred) => guarded(async () => {
        const region = String(cred.region ?? "us-east-1");
        const j = await safeJson(await client.request(`https://guardduty.${region}.amazonaws.com/detector`));
        const ids = (j?.detectorIds as string[]) ?? [];
        return ids.length > 0
          ? pass(`GuardDuty enabled (${ids.length} detector(s) in ${region}).`, { detectors: ids.length, region })
          : fail(`No GuardDuty detector in ${region}.`, "Enable GuardDuty in the region(s) hosting the AI workload.");
      }),
    },
  ],
};

export const gcpRecipe: ProviderRecipe = {
  id: "gcp",
  name: "Google Cloud",
  category: "Cloud",
  accent: "#4285f4",
  maturity: "verified",
  summary: "Read-only check that Data Access audit logging (Data Read + Data Write) is enabled in a GCP project.",
  auth: {
    method: "gcp_service_account",
    broker: "native",
    // Full cloud-platform OAuth scope (Vertex AI rejects cloud-platform.read-only). Read-only is
    // still enforced by IAM — the SA only holds viewer roles, so it can read but never write.
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    scope: "https://www.googleapis.com/auth/cloud-platform",
    fields: [
      { key: "projectId", label: "Project ID", placeholder: "my-ml-project" },
      { key: "location", label: "Vertex AI region", placeholder: "us-central1", optional: true },
      { key: "clientEmail", label: "Service account email", placeholder: "neo-readonly@my-ml-project.iam.gserviceaccount.com" },
      { key: "privateKey", label: "Service account private key", secret: true, help: "The private_key field from the SA JSON key" },
    ],
    setup: [
      { title: "Create a read-only service account", detail: "Run the Terraform Trust Template — it creates a service account with roles/viewer + roles/logging.viewer and a key.", link: "neo-gcp-readonly.tf" },
      { title: "Paste the SA email + private key", detail: "From the generated key JSON. Neo signs short-lived tokens with it; no broker holds it." },
      { title: "Enter the project id", detail: "The project running your AI workloads." },
    ],
  },
  trustTemplate: { iac: "terraform", filename: "neo-gcp-readonly.tf", note: "Service account with viewer + logging.viewer." },
  async preflight(client, cred) {
    return [await reachable(client, `https://cloudresourcemanager.googleapis.com/v1/projects/${cred.projectId}`, "SA token + project access")];
  },
  capabilities: [
    {
      capabilityId: "cloud_audit_logging_enabled",
      label: "Data Access audit logging (Data Read + Data Write)",
      unlocksControls: ["logging-and-monitoring", "audit-trail"],
      freshnessHours: 24,
      run: (client, cred) => guarded(async () => {
        const res = await client.request(`https://cloudresourcemanager.googleapis.com/v1/projects/${cred.projectId}:getIamPolicy`, { method: "POST", body: "{}" });
        const j = await safeJson(res);
        const configs = (j?.auditConfigs as { service?: string; auditLogConfigs?: { logType?: string }[] }[]) ?? [];
        const logTypes = new Set<string>();
        let allServices = false;
        for (const c of configs) {
          if (c.service === "allServices") allServices = true;
          for (const lc of c.auditLogConfigs ?? []) if (lc.logType) logTypes.add(lc.logType);
        }
        const hasRead = logTypes.has("DATA_READ");
        const hasWrite = logTypes.has("DATA_WRITE");
        const evidence = { dataRead: hasRead, dataWrite: hasWrite, allServices, logTypes: [...logTypes] };
        const fix = "Enable Data Read and Data Write audit logs: GCP console → IAM & Admin → Audit Logs → select services (or 'All services') → tick Data Read + Data Write → Save.";
        if (hasRead && hasWrite) {
          return pass(`Data Access audit logging is on (Data Read + Data Write${allServices ? ", all services" : ""}).`, evidence);
        }
        if (hasRead || hasWrite) {
          return {
            result: "partial",
            note: `Only ${hasRead ? "Data Read" : "Data Write"} audit logging is enabled — the other is off.`,
            normalizedEvidence: evidence, confidence: "high", policyDecision: "conditions", remediationHint: fix,
          };
        }
        return fail("Data Access audit logging (Data Read / Data Write) is not enabled on this project.", fix);
      }),
    },
    {
      // Vertex AI inventory — enumerate the project's models + endpoints in a region (Pillar 1).
      capabilityId: "ai_platform_inventory",
      label: "Vertex AI inventory (models + endpoints)",
      unlocksControls: ["ai-inventory", "model-inventory"],
      freshnessHours: 168,
      run: (client, cred) => guarded(async () => {
        const project = String(cred.projectId ?? "");
        const loc = String(cred.location ?? "us-central1");
        const base = `https://${loc}-aiplatform.googleapis.com/v1/projects/${project}/locations/${loc}`;
        const mRes = await client.request(`${base}/models`);
        if (!mRes.ok) {
          const msg = ((await safeJson(mRes))?.error as { message?: string })?.message ?? `HTTP ${mRes.status}`;
          // Billing off / API not enabled ⇒ the project simply isn't running Vertex AI. That's a
          // clean "no Vertex footprint" answer, not a control failure — only auth/permission is a FAIL.
          if (/billing|has not been used|service.?disabled|is disabled|not been enabled/i.test(msg)) {
            return pass(`No Vertex AI footprint in ${project} (${loc}) — Vertex API/billing not enabled here.`, { project, location: loc, vertexInUse: false });
          }
          return fail(`Vertex AI read failed: ${msg}`, "Grant roles/aiplatform.viewer and enable the Vertex AI API. The connector uses the full cloud-platform scope (read-only via IAM).");
        }
        const models = ((await safeJson(mRes))?.models as unknown[] ?? []).length;
        const endpoints = (((await safeJson(await client.request(`${base}/endpoints`)))?.endpoints as unknown[]) ?? []).length;
        return pass(`Vertex AI in ${loc}: ${models} model(s), ${endpoints} endpoint(s).`, { project, location: loc, models, endpoints });
      }),
    },
  ],
};

export const azureRecipe: ProviderRecipe = {
  id: "azure",
  name: "Azure",
  category: "Cloud",
  accent: "#0078d4",
  maturity: "verified",
  summary: "Read-only check that the subscription's Activity Log is exported via a diagnostic setting.",
  auth: {
    method: "oauth2_client_credentials",
    broker: "native",
    scopes: ["https://management.azure.com/.default"],
    scope: "https://management.azure.com/.default",
    baseUrlTemplate: "https://management.azure.com",
    tokenUrlTemplate: "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token",
    fields: [
      { key: "tenantId", label: "Tenant ID" },
      { key: "clientId", label: "App (client) ID" },
      { key: "clientSecret", label: "Client secret", secret: true },
      { key: "subscriptionId", label: "Subscription ID" },
    ],
    setup: [
      { title: "Register a read-only app", detail: "Run the Bicep/Terraform Trust Template — it creates an app registration with the Reader role on the subscription.", link: "neo-azure-readonly.bicep" },
      { title: "Paste tenant / client id / secret", detail: "From the app registration. Neo exchanges these for short-lived read-only tokens." },
      { title: "Enter the subscription id", detail: "The subscription hosting your AI workloads." },
    ],
  },
  trustTemplate: { iac: "bicep", filename: "neo-azure-readonly.bicep", note: "App registration with Reader on the subscription." },
  async preflight(client, cred) {
    return [await reachable(client, `/subscriptions/${cred.subscriptionId}?api-version=2020-01-01`, "Token + subscription access")];
  },
  capabilities: [
    {
      capabilityId: "cloud_audit_logging_enabled",
      label: "Activity Log export configured (diagnostic setting)",
      unlocksControls: ["logging-and-monitoring", "audit-trail"],
      freshnessHours: 24,
      run: (client, cred) => guarded(async () => {
        const res = await client.request(`/subscriptions/${cred.subscriptionId}/providers/Microsoft.Insights/diagnosticSettings?api-version=2021-05-01-preview`);
        const j = await safeJson(res);
        const settings = (j?.value as unknown[]) ?? [];
        const fix = "Azure portal → Monitor → Activity log → Export Activity Logs → Add diagnostic setting → send to a Log Analytics workspace or storage account.";
        return settings.length > 0
          ? pass(`Activity Log is being exported (${settings.length} diagnostic setting(s)).`, { settings: settings.length })
          : fail("No Activity Log diagnostic setting on this subscription.", fix);
      }),
    },
    {
      // Azure OpenAI inventory — Cognitive Services accounts of kind "OpenAI" in the subscription (Pillar 1).
      capabilityId: "ai_platform_inventory",
      label: "Azure OpenAI inventory (Cognitive Services accounts)",
      unlocksControls: ["ai-inventory", "model-inventory"],
      freshnessHours: 168,
      run: (client, cred) => guarded(async () => {
        const sub = String(cred.subscriptionId ?? "");
        const res = await client.request(`/subscriptions/${sub}/providers/Microsoft.CognitiveServices/accounts?api-version=2023-05-01`);
        if (res.status === 403) return fail("Reader role can't read Cognitive Services.", "Ensure the app registration has Reader on the subscription.");
        const all = ((await safeJson(res))?.value as { kind?: string; name?: string }[]) ?? [];
        const openai = all.filter((a) => (a.kind ?? "").toLowerCase() === "openai");
        return openai.length > 0
          ? pass(`${openai.length} Azure OpenAI account(s) in the subscription.`, { openaiAccounts: openai.length, totalCognitive: all.length })
          : pass(`No Azure OpenAI footprint in this subscription (${all.length} Cognitive Services account(s), none of kind OpenAI).`, { openaiAccounts: 0, totalCognitive: all.length });
      }),
    },
  ],
};

export const cloudRecipes = [awsRecipe, gcpRecipe, azureRecipe];
