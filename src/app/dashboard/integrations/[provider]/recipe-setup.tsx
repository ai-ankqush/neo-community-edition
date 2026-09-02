"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getIntegrationHelp } from "@/lib/integration-help";
import IntegrationHelpPanel from "../integration-help";
import { BRAND } from "@/lib/brand";

type Field = { key: string; label: string; placeholder?: string; secret?: boolean; help?: string };
type SetupStep = { title: string; detail: string; link?: string };
type Cap = { capabilityId: string; label: string };
type View = {
  id: string; name: string; summary: string; maturity: string;
  fields: Field[]; setup: SetupStep[]; scopes: string[];
  trustTemplate: { iac: string; filename: string; note: string } | null;
  capabilities: Cap[];
};
type Conn = { id: string; label: string | null; status: string };
type Preflight = { id: string; label: string; state: string; detail?: string };
type Check = { result: string; note?: string; remediationHint?: string | null; rawArtifactRef?: string | null } | null;

function StepRow({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#3b82f6] text-[12px] font-bold text-white">{n}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-[var(--text)]">{title}</p>
        <div className="mt-1 text-[12.5px] leading-relaxed text-[var(--muted)]">{children}</div>
      </div>
    </div>
  );
}

const STATE_COLOR: Record<string, string> = { ready: "#22c55e", needs_scope: "#f59e0b", unreachable: "#ef4444", auth_failed: "#ef4444" };
const RESULT_COLOR: Record<string, string> = { pass: "#22c55e", fail: "#ef4444", partial: "#f59e0b", error: "#8892a4" };

export default function RecipeSetup({ view, connections, canManage, neoAwsAccountId }: { view: View; connections: Conn[]; canManage: boolean; neoAwsAccountId?: string | null }) {
  const router = useRouter();
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<Preflight[] | null>(null);
  const [check, setCheck] = useState<Check>(null);
  const [copied, setCopied] = useState(false);
  const [orgMode, setOrgMode] = useState(false); // AWS: single account vs Organization (StackSet)

  const connected = connections.length > 0;
  const isAws = view.id === "aws";
  const isGcp = view.id === "gcp";
  const isAzure = view.id === "azure";
  const isCloud = isAws || isGcp || isAzure;
  const field = "rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[#3b82f6]";

  // AWS: auto-generate a unique external id (no typing), used in the script + stored on connect
  useEffect(() => {
    if (isAws && !vals.externalId) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      const ext = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
      setVals((v) => ({ ...v, externalId: ext }));
    }
  }, [isAws, vals.externalId]);

  const awsAccount = neoAwsAccountId || "<NEO_AWS_ACCOUNT_ID>";
  const awsScript = `cat > neo-verifier.yaml <<'EOF'
AWSTemplateFormatVersion: "2010-09-09"
Description: "${BRAND.name} AI Control read-only cross-account verifier role - Enhanced (SecurityAudit plus Bedrock inventory)."
Resources:
  NeoVerifierRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: NeoControlReadOnlyVerifierRole
      MaxSessionDuration: 3600
      AssumeRolePolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Effect: Allow
            Principal: { AWS: "arn:aws:iam::${awsAccount}:root" }
            Action: "sts:AssumeRole"
            Condition: { StringEquals: { "sts:ExternalId": "${vals.externalId ?? ""}" } }
      ManagedPolicyArns:
        - "arn:aws:iam::aws:policy/SecurityAudit"
        - "arn:aws:iam::aws:policy/job-function/ViewOnlyAccess"
      Policies:
        - PolicyName: NeoControlSupplementalReadOnly
          PolicyDocument:
            Version: "2012-10-17"
            Statement:
              - Effect: Allow
                Action:
                  - "bedrock:ListFoundationModels"
                  - "bedrock:GetFoundationModel"
                  - "bedrock:ListCustomModels"
                  - "bedrock:GetCustomModel"
                  - "bedrock:ListProvisionedModelThroughputs"
                  - "bedrock:ListGuardrails"
                  - "bedrock:GetGuardrail"
                  - "bedrock:ListAgents"
                  - "bedrock:GetModelInvocationLoggingConfiguration"
                Resource: "*"
Outputs:
  RoleArn: { Value: !GetAtt NeoVerifierRole.Arn }
EOF
aws cloudformation deploy --template-file neo-verifier.yaml \\
  --stack-name neo-control-verifier --capabilities CAPABILITY_NAMED_IAM && \\
echo "ROLE ARN ->" && \\
aws cloudformation describe-stacks --stack-name neo-control-verifier \\
  --query "Stacks[0].Outputs[?OutputKey=='RoleArn'].OutputValue" --output text`;

  const gcpScript = `PROJECT="${vals.projectId || "YOUR_PROJECT_ID"}"
gcloud config set project "$PROJECT"
gcloud services enable iam.googleapis.com cloudresourcemanager.googleapis.com aiplatform.googleapis.com
SA="neo-readonly@\${PROJECT}.iam.gserviceaccount.com"
gcloud iam service-accounts create neo-readonly --display-name="${BRAND.name} AI Control (read-only)" 2>/dev/null
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$SA" --role="roles/viewer" --condition=None >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$SA" --role="roles/logging.viewer" --condition=None >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$SA" --role="roles/aiplatform.viewer" --condition=None >/dev/null
gcloud iam service-accounts keys create neo-key.json --iam-account="$SA"
echo ""
echo "PROJECT_ID  -> $PROJECT"
echo "SA_EMAIL    -> $SA"
echo "PRIVATE_KEY -> copy everything from BEGIN to END (inclusive) into the Private key box:"
python3 -c "import json;print(json.load(open('neo-key.json'))['private_key'])"`;

  const azureScript = `echo "Subscription:"; az account show --query "[name,id]" -o tsv
SUB=$(az account show --query id -o tsv)
TENANT=$(az account show --query tenantId -o tsv)
APP_ID=$(az ad app create --display-name "${BRAND.name} AI Control (read-only)" --query appId -o tsv)
SP_ID=$(az ad sp create --id "$APP_ID" --query id -o tsv)
SECRET=$(az ad app credential reset --id "$APP_ID" --query password -o tsv)
echo "Assigning Reader (waiting for the directory to replicate)..."
for i in $(seq 1 8); do
  az role assignment create --assignee-object-id "$SP_ID" --assignee-principal-type ServicePrincipal \\
    --role Reader --scope "/subscriptions/$SUB" >/dev/null 2>&1 && { echo "Reader assigned."; break; }
  sleep 10
done
echo ""
echo "TENANT_ID        -> $TENANT"
echo "CLIENT_ID        -> $APP_ID"
echo "CLIENT_SECRET    -> $SECRET"
echo "SUBSCRIPTION_ID  -> $SUB"`;

  const entraScript = `APP_ID=$(az ad app create --display-name "${BRAND.name} AI Control (read-only)" --query appId -o tsv)
az ad sp create --id "$APP_ID" >/dev/null
# Microsoft Graph: Policy.Read.All + Organization.Read.All (application roles)
az ad app permission add --id "$APP_ID" --api 00000003-0000-0000-c000-000000000000 \\
  --api-permissions 246dd0d5-5bd0-4def-940b-0421030a5b68=Role 498476ce-e0fe-48b0-b801-37ba7e2685c6=Role >/dev/null
az ad app permission admin-consent --id "$APP_ID" 2>/dev/null && echo "Admin consent granted." || echo "NOTE: grant admin consent in Entra → App registrations → API permissions."
SECRET=$(az ad app credential reset --id "$APP_ID" --query password -o tsv)
TENANT=$(az account show --query tenantId -o tsv)
echo ""
echo "TENANT_ID     -> $TENANT"
echo "CLIENT_ID     -> $APP_ID"
echo "CLIENT_SECRET -> $SECRET"`;

  const SCRIPTS: Record<string, string> = { aws: awsScript, gcp: gcpScript, azure: azureScript, entra: entraScript };
  const SHELL_NOTE: Record<string, string> = {
    aws: "AWS CloudShell (the ›_ icon in the AWS console top bar)",
    gcp: "Google Cloud Shell (the ›_ icon in the GCP console top bar)",
    azure: "Azure Cloud Shell (the ›_ icon in the Azure portal top bar) — pick Bash",
    entra: "Azure Cloud Shell (the ›_ icon in the Azure portal top bar) — pick Bash",
  };
  const script = SCRIPTS[view.id];
  const isScripted = Boolean(script);

  // Zero-effort path: a CloudFormation "Launch Stack" quick-create console link with the template
  // and all parameters pre-filled. Customer clicks → reviews → Create. No CLI, no pasted YAML.
  // Requires the template hosted in S3 (NEXT_PUBLIC_NEO_AWS_TEMPLATE_URL); falls back to the CLI.
  const awsRegion = vals.region || "us-east-1";
  const awsTemplateUrl = process.env.NEXT_PUBLIC_NEO_AWS_TEMPLATE_URL || "";
  const awsLaunchUrl =
    isAws && awsTemplateUrl && neoAwsAccountId
      ? `https://console.aws.amazon.com/cloudformation/home?region=${awsRegion}#/stacks/quickcreate` +
        `?templateURL=${encodeURIComponent(awsTemplateUrl)}` +
        `&stackName=neo-control-verifier` +
        `&param_NeoAccountId=${neoAwsAccountId}` +
        `&param_ExternalId=${encodeURIComponent(vals.externalId ?? "")}` +
        `&param_VerificationMode=Enhanced`
      : "";

  // AWS Organization (multi-account) mode. StackSets have no quick-create URL, so we offer BOTH a
  // console deep-link and an automated CloudShell script. Customer then connects with just the
  // management account id; Neo derives each role ARN and (org fan-out) reads every member account.
  const awsStackSetConsoleUrl = `https://console.aws.amazon.com/cloudformation/home?region=${awsRegion}#/stacksets`;
  const tmplUrl = awsTemplateUrl || "<set NEXT_PUBLIC_NEO_AWS_TEMPLATE_URL>";
  const awsStackSetScript = `# Run ONCE in CloudShell of your AWS Organizations MANAGEMENT account.
# Deploys the ${BRAND.name} read-only verifier role to this management account AND every member account
# (current + future) via a service-managed StackSet. Read-only, no keys.
aws organizations enable-aws-service-access --service-principal stacksets.cloudformation.amazonaws.com 2>/dev/null
aws cloudformation create-stack --stack-name neo-control-verifier \\
  --template-url ${tmplUrl} --capabilities CAPABILITY_NAMED_IAM \\
  --parameters ParameterKey=NeoAccountId,ParameterValue=${awsAccount} ParameterKey=ExternalId,ParameterValue=${vals.externalId ?? ""} ParameterKey=VerificationMode,ParameterValue=Enhanced 2>/dev/null
aws cloudformation create-stack-set --stack-set-name NeoControlReadOnlyVerifier \\
  --template-url ${tmplUrl} --capabilities CAPABILITY_NAMED_IAM \\
  --permission-model SERVICE_MANAGED --auto-deployment Enabled=true,RetainStacksOnAccountRemoval=false \\
  --parameters ParameterKey=NeoAccountId,ParameterValue=${awsAccount} ParameterKey=ExternalId,ParameterValue=${vals.externalId ?? ""} ParameterKey=VerificationMode,ParameterValue=Enhanced 2>/dev/null
ROOT=$(aws organizations list-roots --query 'Roots[0].Id' --output text)
aws cloudformation create-stack-instances --stack-set-name NeoControlReadOnlyVerifier \\
  --deployment-targets OrganizationalUnitIds=$ROOT --regions ${awsRegion}
echo ""; echo "MANAGEMENT ACCOUNT ID (paste into ${BRAND.name}) ->"; aws sts get-caller-identity --query Account --output text`;

  // GCP org: grant read-only at the ORGANIZATION node → inherited by every project under it.
  const gcpOrgScript = `# Run in Cloud Shell as an Organization Admin. Grants ${BRAND.name} read-only at the ORG level (inherited by EVERY project).
ORG_ID=$(gcloud organizations list --format='value(ID)' | head -1)
HOST="${vals.projectId || "YOUR_HOST_PROJECT"}"
gcloud config set project "$HOST"
gcloud services enable iam.googleapis.com cloudresourcemanager.googleapis.com aiplatform.googleapis.com
SA="neo-readonly@\${HOST}.iam.gserviceaccount.com"
gcloud iam service-accounts create neo-readonly --display-name="${BRAND.name} AI Control (read-only)" 2>/dev/null
for R in roles/viewer roles/logging.viewer roles/aiplatform.viewer roles/resourcemanager.organizationViewer; do
  gcloud organizations add-iam-policy-binding "$ORG_ID" --member="serviceAccount:$SA" --role="$R" --condition=None >/dev/null
done
gcloud iam service-accounts keys create neo-key.json --iam-account="$SA"
echo ""; echo "ORG_ID      -> $ORG_ID"; echo "SA_EMAIL    -> $SA"
echo "PRIVATE_KEY -> copy BEGIN..END into the Private key box:"
python3 -c "import json;print(json.load(open('neo-key.json'))['private_key'])"`;

  // Azure org: assign Reader at the MANAGEMENT GROUP → inherited by every subscription under it.
  const azureOrgScript = `# Run in Cloud Shell (Bash) by someone with access to the management group.
MG_ID=$(az account management-group list --query '[0].name' -o tsv)
APP_ID=$(az ad app create --display-name "${BRAND.name} AI Control (read-only)" --query appId -o tsv)
SP_ID=$(az ad sp create --id "$APP_ID" --query id -o tsv)
SECRET=$(az ad app credential reset --id "$APP_ID" --query password -o tsv)
TENANT=$(az account show --query tenantId -o tsv)
az role assignment create --assignee-object-id "$SP_ID" --assignee-principal-type ServicePrincipal \\
  --role Reader --scope "/providers/Microsoft.Management/managementGroups/$MG_ID" >/dev/null 2>&1 && echo "Reader assigned at management group." || echo "NOTE: assign Reader at the management group scope manually."
echo ""; echo "MGMT_GROUP_ID -> $MG_ID"; echo "TENANT_ID -> $TENANT"; echo "CLIENT_ID -> $APP_ID"; echo "CLIENT_SECRET -> $SECRET"`;

  // Script for the single-flow StepRow: org script in org mode (GCP/Azure route here; AWS org has its own StepRow).
  const activeScript = orgMode && isGcp ? gcpOrgScript : orgMode && isAzure ? azureOrgScript : script;

  async function copyText(t: string) {
    try { await navigator.clipboard.writeText(t); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  }

  async function copyScript() {
    try { await navigator.clipboard.writeText(activeScript); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  }

  async function post(url: string, body?: unknown) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Request failed");
    return json;
  }

  async function connect() {
    if (busy) return; setBusy(true); setErr(null);
    try {
      const orgExtra = orgMode && (isGcp || isAzure)
        ? { scopeLevel: "org", accountRef: isGcp ? vals.orgRef : vals.subscriptionId }
        : {};
      await post("/api/connections", { provider: view.id, ...vals, ...orgExtra });
      setVals({}); router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not connect"); } finally { setBusy(false); }
  }
  // AWS Organization connect: customer gives just the management account id; Neo derives the role
  // ARN (fixed name) and stores an org-scoped connection that fans out to every member account.
  async function connectOrg() {
    if (busy) return; setBusy(true); setErr(null);
    try {
      const acct = (vals.mgmtAccountId ?? "").trim();
      const roleArn = `arn:aws:iam::${acct}:role/NeoControlReadOnlyVerifierRole`;
      await post("/api/connections", {
        provider: "aws", roleArn, externalId: vals.externalId, region: vals.region || "us-east-1",
        scopeLevel: "org", accountRef: acct,
      });
      setVals({}); router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not connect"); } finally { setBusy(false); }
  }
  async function disconnect(id: string) {
    if (busy) return; setBusy(true); setErr(null);
    try { await fetch(`/api/connections/${id}`, { method: "DELETE" }); router.refresh(); }
    catch { setErr("Could not remove"); } finally { setBusy(false); }
  }
  async function runPreflight() {
    if (busy) return; setBusy(true); setErr(null); setPreflight(null);
    try { const j = await post(`/api/integrations/${view.id}/preflight`); setPreflight(j.results); }
    catch (e) { setErr(e instanceof Error ? e.message : "Preflight failed"); } finally { setBusy(false); }
  }
  async function runCheck(capabilityId: string) {
    if (busy) return; setBusy(true); setErr(null); setCheck(null);
    try { const j = await post(`/api/integrations/${view.id}/check`, { capabilityId }); setCheck(j.check); }
    catch (e) { setErr(e instanceof Error ? e.message : "Check failed"); } finally { setBusy(false); }
  }

  // multi-line PEM keys get a textarea; everything else a single input
  const renderInput = (f: Field) =>
    f.key === "privateKey" ? (
      <textarea rows={4} value={vals[f.key] ?? ""}
        onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
        placeholder={f.placeholder} className={`${field} w-full font-mono text-[11px]`} />
    ) : (
      <input type={f.secret ? "password" : "text"} value={vals[f.key] ?? ""}
        onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
        placeholder={f.placeholder} className={`${field} w-full`} />
    );

  return (
    <div className="mt-5 flex flex-col gap-5">
      {connected && (
        <div className="rounded-[10px] border border-[#22c55e40] bg-[#22c55e0d] p-4">
          <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[#22c55e]">Connected</p>
          {connections.map((c) => (
            <div key={c.id} className="flex items-center gap-3 py-1.5">
              <span className="text-[13px] text-[var(--text)]">{c.label}</span>
              <span className="text-[11px] text-[#22c55e]">● {c.status}</span>
              {canManage && (
                <button onClick={() => disconnect(c.id)} disabled={busy}
                  className="ml-auto rounded-md border border-[var(--border)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)] hover:border-red-500/50 hover:text-red-500 disabled:opacity-50">
                  Disconnect
                </button>
              )}
            </div>
          ))}
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={runPreflight} disabled={busy}
              className="rounded-md bg-[#3b82f6] px-3.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">
              {busy ? "Running…" : "Run preflight"}
            </button>
            {view.capabilities.map((cap) => (
              <button key={cap.capabilityId} onClick={() => runCheck(cap.capabilityId)} disabled={busy}
                className="rounded-md border border-[var(--border)] px-3.5 py-1.5 text-[12px] font-semibold text-[var(--text)] hover:border-[#3b82f660] hover:text-[#3b82f6] disabled:opacity-50">
                Check: {cap.label}
              </button>
            ))}
          </div>

          {preflight && (
            <div className="mt-3 space-y-1">
              {preflight.map((p) => (
                <div key={p.id} className="text-[12px]">
                  <span style={{ color: STATE_COLOR[p.state] ?? "#8892a4" }}>●</span>{" "}
                  <span className="text-[var(--text)]">{p.label}</span>
                  <span className="text-[var(--faint)]"> — {p.state}{p.detail ? ` (${p.detail})` : ""}</span>
                </div>
              ))}
            </div>
          )}
          {check && (
            <div className="mt-3 rounded-md border border-[var(--border)] bg-[var(--panel)] p-3 text-[12.5px]">
              <span className="font-bold" style={{ color: RESULT_COLOR[check.result] ?? "#8892a4" }}>{check.result.toUpperCase()}</span>
              {check.note && <span className="text-[var(--muted)]"> — {check.note}</span>}
              {check.remediationHint && <p className="mt-1 text-[#f59e0b]">Fix: {check.remediationHint}</p>}
            </div>
          )}
        </div>
      )}

      {canManage ? (
        <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="flex flex-col gap-5">
            {isScripted ? (
              <>
                {isCloud && (
                  <div className="flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-1 text-[12px]">
                    <button type="button" onClick={() => setOrgMode(false)}
                      className={`flex-1 rounded-md px-3 py-1.5 font-semibold ${!orgMode ? "bg-[var(--border)] text-[var(--text)]" : "text-[var(--faint)]"}`}>
                      Single {isAws ? "account" : isGcp ? "project" : "subscription"}
                    </button>
                    <button type="button" onClick={() => setOrgMode(true)}
                      className={`flex-1 rounded-md px-3 py-1.5 font-semibold ${orgMode ? "bg-[var(--border)] text-[var(--text)]" : "text-[var(--faint)]"}`}>
                      {isAws ? "AWS Organization" : isGcp ? "GCP Organization" : "Management Group"} (all {isAws ? "accounts" : isGcp ? "projects" : "subscriptions"})
                    </button>
                  </div>
                )}
                {isAws && orgMode ? (
                <StepRow n={1} title="Deploy org-wide + connect">
                  <p>
                    Deploy the read-only role across <span className="font-semibold">every account</span> in your AWS Organization — current and
                    future — in one go. Use the console wizard or the automated CloudShell script, run in your <span className="font-semibold">management account</span>.
                  </p>
                  <a href={awsStackSetConsoleUrl} target="_blank" rel="noopener noreferrer"
                    className="mt-2 inline-block rounded-md border border-[var(--border)] px-4 py-2 text-[13px] font-bold text-[#ff9900] hover:border-[#ff9900]">
                    Open StackSets console ↗
                  </a>
                  {neoAwsAccountId ? (
                    <div className="relative mt-3">
                      <button onClick={() => copyText(awsStackSetScript)}
                        className="absolute right-2 top-2 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[11px] font-semibold text-[var(--muted)] hover:text-[#3b82f6]">
                        {copied ? "Copied ✓" : "Copy"}
                      </button>
                      <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-md border border-[var(--border)] bg-[var(--panel)] p-3 pr-14 text-[11px] leading-relaxed text-[var(--text)]">{awsStackSetScript}</pre>
                    </div>
                  ) : (
                    <div className="mt-2 rounded-md border border-[#ef444440] bg-[#ef44440d] p-3 text-[12px] text-[#ef4444]">Set NEXT_PUBLIC_NEO_AWS_ACCOUNT_ID and redeploy to generate the org script.</div>
                  )}
                  <p className="mt-1.5 text-[11px] text-[var(--faint)]">External id (auto, stored with the connection): <span className="font-mono text-[var(--muted)]">{vals.externalId}</span></p>
                  <div className="mt-4">
                    <label className="mb-1 block text-[11px] uppercase text-[var(--faint)]">Management account ID</label>
                    <input type="text" value={vals.mgmtAccountId ?? ""} onChange={(e) => setVals((v) => ({ ...v, mgmtAccountId: e.target.value.trim() }))}
                      placeholder="123456789012" className={`${field} w-full max-w-xs`} />
                    <p className="mt-1 text-[11px] text-[var(--faint)]">The script prints this. {BRAND.name} reads every member account from here.</p>
                    <button onClick={connectOrg} disabled={busy || !vals.externalId || !neoAwsAccountId || !/^[0-9]{12}$/.test(vals.mgmtAccountId ?? "")}
                      className="mt-3 self-start rounded-md bg-[#3b82f6] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
                      {busy ? "Connecting…" : "Connect organization"}
                    </button>
                  </div>
                </StepRow>
                ) : (
                <>
                <StepRow n={1} title="Generate read-only access">
                  {isAws && awsLaunchUrl && (
                    <div className="mb-3 rounded-md border border-[#22c55e40] bg-[#22c55e0d] p-3">
                      <p className="mb-2 text-[12px] text-[var(--text)]">
                        <span className="font-semibold text-[#22c55e]">One-click setup (recommended).</span> Opens the AWS console with the
                        template and all parameters pre-filled — review, tick the IAM acknowledgement, and Create. No CLI, nothing to type.
                      </p>
                      <a href={awsLaunchUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-block rounded-md bg-[#ff9900] px-4 py-2 text-[13px] font-bold text-black hover:opacity-90">
                        Launch Stack ↗
                      </a>
                      <p className="mt-2 text-[11px] text-[var(--faint)]">
                        When it finishes, copy the <span className="font-mono">RoleArn</span> from the stack Outputs and paste it below.
                      </p>
                    </div>
                  )}
                  <p>
                    {isAws && awsLaunchUrl ? "Prefer the command line? Open " : "Open "}
                    <span className="font-semibold">{SHELL_NOTE[view.id]}</span> and paste this. It creates read-only access for {BRAND.name} and
                    prints the values to paste below{isAws ? " — your external id is already baked in, nothing to type" : ""}.
                  </p>
                  {isGcp && (
                    <div className="mt-2">
                      <label className="mb-1 block text-[11px] uppercase text-[var(--faint)]">GCP Project ID</label>
                      <input type="text" value={vals.projectId ?? ""}
                        onChange={(e) => setVals((v) => ({ ...v, projectId: e.target.value }))}
                        placeholder="my-ml-project" className={`${field} w-full max-w-xs`} />
                      <p className="mt-1 text-[11px] text-[var(--faint)]">Enter your project id — the script below fills in automatically, then copy it.</p>
                    </div>
                  )}
                  {isAws && !neoAwsAccountId ? (
                    <div className="mt-2 rounded-md border border-[#ef444440] bg-[#ef44440d] p-3 text-[12px] text-[#ef4444]">
                      {BRAND.name}&apos;s AWS account id isn&apos;t configured yet. Set <span className="font-mono">NEXT_PUBLIC_NEO_AWS_ACCOUNT_ID</span> in
                      the environment and redeploy — the setup script can&apos;t be generated safely until it&apos;s set.
                    </div>
                  ) : (
                    <div className="relative mt-2">
                      <button onClick={copyScript}
                        className="absolute right-2 top-2 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[11px] font-semibold text-[var(--muted)] hover:text-[#3b82f6]">
                        {copied ? "Copied ✓" : "Copy"}
                      </button>
                      <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-md border border-[var(--border)] bg-[var(--panel)] p-3 pr-14 text-[11px] leading-relaxed text-[var(--text)]">{activeScript}</pre>
                    </div>
                  )}
                  {isAws && neoAwsAccountId && (
                    <p className="mt-1.5 text-[11px] text-[var(--faint)]">
                      External id (auto-generated, stored with the connection): <span className="font-mono text-[var(--muted)]">{vals.externalId}</span>
                    </p>
                  )}
                </StepRow>

                <StepRow n={2} title="Paste the printed values & connect">
                  <div className="mt-1 flex flex-col gap-2.5">
                    {view.fields.filter((f) => f.label && !(isAws && f.key === "externalId") && !(isGcp && f.key === "projectId")).map((f) => (
                      <div key={f.key}>
                        <label className="mb-1 block text-[11px] uppercase text-[var(--faint)]">
                          {orgMode && f.key === "subscriptionId" ? "Management Group ID" : f.label}
                        </label>
                        {renderInput(f)}
                        {f.help && <p className="mt-0.5 text-[10.5px] text-[var(--faint)]">{f.help}</p>}
                      </div>
                    ))}
                    {orgMode && isGcp && (
                      <div>
                        <label className="mb-1 block text-[11px] uppercase text-[var(--faint)]">Organization ID</label>
                        <input type="text" value={vals.orgRef ?? ""} onChange={(e) => setVals((v) => ({ ...v, orgRef: e.target.value.trim() }))}
                          placeholder="123456789012" className={`${field} w-full max-w-xs`} />
                        <p className="mt-0.5 text-[10.5px] text-[var(--faint)]">Printed by the script (ORG_ID). {BRAND.name} reads every project under it.</p>
                      </div>
                    )}
                    <button onClick={connect} disabled={busy || (isAws && (!vals.externalId || !neoAwsAccountId)) || (isGcp && !vals.projectId) || (isGcp && orgMode && !vals.orgRef)}
                      className="mt-1 self-start rounded-md bg-[#3b82f6] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
                      {busy ? "Connecting…" : orgMode ? "Connect organization" : "Connect"}
                    </button>
                  </div>
                </StepRow>
                </>
                )}
              </>
            ) : (
              <>
                <StepRow n={1} title="Set up access">
                  <ul className="ml-0 list-none space-y-1.5">
                    {view.setup.map((s, i) => (
                      <li key={i}>
                        <span className="font-semibold text-[var(--text)]">{s.title}.</span> {s.detail}
                        {s.link && view.trustTemplate && s.link === view.trustTemplate.filename && (
                          <> <a href={`/trust-templates/${s.link}`} className="text-[#3b82f6] underline" download>download template ↓</a></>
                        )}
                        {s.link && s.link.startsWith("http") && (
                          <> <a href={s.link} target="_blank" rel="noopener noreferrer" className="text-[#3b82f6] underline">open ↗</a></>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11px] text-[var(--faint)]">Scopes requested: {view.scopes.join(", ")}</p>
                </StepRow>

                <StepRow n={2} title="Enter credentials & connect">
                  <div className="mt-1 flex flex-col gap-2.5">
                    {view.fields.filter((f) => f.label).map((f) => (
                      <div key={f.key}>
                        <label className="mb-1 block text-[11px] uppercase text-[var(--faint)]">{f.label}</label>
                        <input
                          type={f.secret ? "password" : "text"}
                          value={vals[f.key] ?? ""}
                          onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
                          placeholder={f.placeholder}
                          className={`${field} w-full`}
                        />
                        {f.help && <p className="mt-0.5 text-[10.5px] text-[var(--faint)]">{f.help}</p>}
                      </div>
                    ))}
                    <button onClick={connect} disabled={busy}
                      className="mt-1 self-start rounded-md bg-[#3b82f6] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
                      {busy ? "Connecting…" : "Connect"}
                    </button>
                  </div>
                </StepRow>
              </>
            )}
          </div>
          {err && <p className="mt-3 text-[12.5px] text-red-500">{err}</p>}
        </div>
      ) : (
        <p className="text-[12.5px] text-[var(--faint)]">An organization admin can connect {view.name}.</p>
      )}

      {view.maturity === "authored_untested" && (
        <p className="text-[11px] leading-relaxed text-[var(--faint)]">
          This connector is authored to {view.name}&apos;s documented API but not yet verified against a live tenant.
          Use Run preflight to validate auth/scope, then Check to confirm the evidence call.
        </p>
      )}

      {getIntegrationHelp(view.id) && <IntegrationHelpPanel name={view.name} help={getIntegrationHelp(view.id)!} />}
    </div>
  );
}
