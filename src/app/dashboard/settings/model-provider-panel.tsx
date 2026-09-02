"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Initial = { provider: string | null; configured: boolean; managed: boolean };

const PROVIDERS: [string, string][] = [
  ["anthropic", "Anthropic API key"],
  ["bedrock", "Amazon Bedrock (keyless role)"],
  ["vertex", "Google Vertex (coming soon)"],
];

const REGIONS = ["us-east-1", "us-west-2", "eu-central-1", "eu-west-1", "ap-southeast-1", "ap-northeast-1"];

export default function ModelProviderPanel({
  initial, canEdit, orgId, neoAwsAccountId,
}: { initial: Initial; canEdit: boolean; orgId: string; neoAwsAccountId: string }) {
  const router = useRouter();
  const [provider, setProvider] = useState<string>(initial.provider || "anthropic");
  const [key, setKey] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const [roleArn, setRoleArn] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (initial.managed) {
    return (
      <p className="text-[13px] text-[var(--muted)]">
        This workspace runs on Neo&rsquo;s managed model key — there is nothing to configure. Model usage is included in your plan.
      </p>
    );
  }

  // Ready-to-paste AWS CloudShell script — creates the keyless role Neo assumes.
  // Neo's account id and this workspace's external id are already baked in.
  const cliScript = `ROLE=neo-bedrock
cat > /tmp/trust.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::${neoAwsAccountId || "<NEO_AWS_ACCOUNT_ID>"}:root" },
    "Action": "sts:AssumeRole",
    "Condition": { "StringEquals": { "sts:ExternalId": "${orgId}" } }
  }]
}
EOF
cat > /tmp/perm.json <<'EOF'
{ "Version": "2012-10-17", "Statement": [{ "Effect": "Allow", "Action": ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"], "Resource": "*" }] }
EOF
aws iam create-role --role-name $ROLE --assume-role-policy-document file:///tmp/trust.json 2>/dev/null || aws iam update-assume-role-policy --role-name $ROLE --policy-document file:///tmp/trust.json
aws iam put-role-policy --role-name $ROLE --policy-name bedrock-invoke --policy-document file:///tmp/perm.json
aws iam get-role --role-name $ROLE --query Role.Arn --output text`;

  async function copyScript() {
    try { await navigator.clipboard.writeText(cliScript); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  }

  const canSave =
    provider === "anthropic" ? key.trim().length >= 10 :
    provider === "bedrock" ? roleArn.trim().startsWith("arn:aws:iam::") && !!region :
    false;

  async function save() {
    setSaving(true); setErr(null); setSaved(false);
    try {
      const body =
        provider === "anthropic" ? { provider, key } :
        provider === "bedrock" ? { provider, meta: { region, roleArn } } :
        { provider };
      const r = await fetch("/api/org/model-provider", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(typeof j.error === "string" ? j.error : "Save failed"); }
      setSaved(true); setKey(""); router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  }

  async function remove() {
    setSaving(true); setErr(null); setSaved(false);
    try {
      const r = await fetch("/api/org/model-provider", { method: "DELETE" });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(typeof j.error === "string" ? j.error : "Remove failed"); }
      setKey(""); setRoleArn(""); router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Remove failed");
    } finally { setSaving(false); }
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <p className="text-[13px] text-[var(--muted)]">
        Community runs on your own model provider, so usage bills to your account, not Neo&rsquo;s. Secrets are encrypted at rest; Bedrock uses a keyless cross-account role (no credentials stored).
      </p>

      {initial.configured && (
        <div className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-[12.5px]">
          <span className="text-[#16a34a]">●</span>
          <span className="text-[var(--text)]">{initial.provider === "bedrock" ? "Amazon Bedrock is configured." : `A ${initial.provider || "model"} key is configured.`}</span>
          {canEdit && (
            <button onClick={remove} disabled={saving} className="ml-auto text-[12px] text-[#dc2626] underline disabled:opacity-60">Remove</button>
          )}
        </div>
      )}

      <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--muted)]">
        Provider
        <select value={provider} disabled={!canEdit}
          onChange={(e) => { setSaved(false); setProvider(e.target.value); }}
          className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-2 text-[13px] text-[var(--text)] disabled:opacity-60">
          {PROVIDERS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </label>

      {provider === "anthropic" && (
        <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--muted)]">
          API key
          <input type="password" value={key} disabled={!canEdit} placeholder={initial.configured ? "Enter a new key to replace the current one" : "sk-ant-…"}
            onChange={(e) => { setSaved(false); setKey(e.target.value); }}
            className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-2 text-[13px] text-[var(--text)] disabled:opacity-60" />
        </label>
      )}

      {provider === "bedrock" && (
        <div className="flex flex-col gap-4">
          <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-3 text-[12px] text-[var(--muted)]">
            <p className="mb-1 font-semibold text-[var(--text)]">Step 1 — Turn on the models in Bedrock</p>
            <p className="mb-3">In the <a href="https://console.aws.amazon.com/bedrock/home#/modelaccess" target="_blank" rel="noreferrer" className="text-[#3b82f6] underline">Bedrock model access console</a> for your region, request access to the Anthropic Claude models (a short use-case form). Use the same region you pick below.</p>

            <p className="mb-1 font-semibold text-[var(--text)]">Step 2 — Create the keyless role</p>
            <p className="mb-2">Open <a href="https://console.aws.amazon.com/cloudshell" target="_blank" rel="noreferrer" className="text-[#3b82f6] underline">AWS CloudShell</a> and paste this — it creates a role only Neo can assume (only for this workspace) and prints the <b className="text-[var(--text)]">Role ARN</b>:</p>
            <div className="relative">
              <button type="button" onClick={copyScript} className="absolute right-1 top-1 rounded bg-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--text)]">{copied ? "Copied" : "Copy"}</button>
              <pre className="overflow-auto rounded bg-[var(--bg-elevated)] p-2 pr-14 text-[11px] leading-relaxed text-[var(--text)]">{cliScript}</pre>
            </div>

            <p className="mt-3 font-semibold text-[var(--text)]">Step 3 — Paste the region + Role ARN below and Save.</p>
          </div>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--muted)]">
            Region
            <select value={region} disabled={!canEdit} onChange={(e) => { setSaved(false); setRegion(e.target.value); }}
              className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-2 text-[13px] text-[var(--text)] disabled:opacity-60">
              {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--muted)]">
            Role ARN
            <input value={roleArn} disabled={!canEdit} placeholder="arn:aws:iam::123456789012:role/neo-bedrock"
              onChange={(e) => { setSaved(false); setRoleArn(e.target.value); }}
              className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-2 text-[13px] text-[var(--text)] disabled:opacity-60" />
          </label>
        </div>
      )}

      {provider === "vertex" && (
        <p className="text-[12px] text-[var(--faint)]">Google Vertex support is landing shortly. For now, use an Anthropic key or Amazon Bedrock.</p>
      )}

      {canEdit ? (
        <div className="flex items-center gap-3">
          <button onClick={save} disabled={saving || !canSave}
            className="rounded-md bg-[#3b82f6] px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
          {saved && <span className="text-[12px] text-[#16a34a]">Saved.</span>}
          {err && <span className="text-[12px] text-[#dc2626]">{err}</span>}
        </div>
      ) : (
        <p className="text-[11px] text-[var(--faint)]">Only an organization admin can set the model provider.</p>
      )}
    </div>
  );
}
