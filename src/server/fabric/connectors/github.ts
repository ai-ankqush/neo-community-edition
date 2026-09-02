import "server-only";
import crypto from "crypto";
import type { Connector, ConnectorContext, CheckResult } from "../types";

/** GitHub connector (anchor provider, native GitHub App auth). Read-only.
 *  Stores only a non-secret installation id on the connection; the App's
 *  private key lives in env (GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY). */

const API = "https://api.github.com";
// where an AI-BOM might live, in priority order
const AI_BOM_PATHS = [
  "ai-bom.json", "ai-bom.cdx.json", ".cyclonedx/ai-bom.json",
  "bom.json", "sbom.json", ".cyclonedx/bom.json", "cyclonedx.json",
];

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Mint a short-lived App JWT (RS256), signed with the App's private key. */
function appJwt(): string {
  const appId = process.env.GITHUB_APP_ID;
  const pem = (process.env.GITHUB_APP_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  if (!appId || !pem) throw new Error("GitHub App not configured (GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY).");
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iat: now - 30, exp: now + 540, iss: appId }));
  const signature = b64url(crypto.createSign("RSA-SHA256").update(`${header}.${payload}`).sign(pem));
  return `${header}.${payload}.${signature}`;
}

const ghHeaders = (auth: string) => ({
  Authorization: auth,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
});

/** Exchange the App JWT for a short-lived installation token. */
async function installationToken(installationId: string): Promise<string> {
  const res = await fetch(`${API}/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: ghHeaders(`Bearer ${appJwt()}`),
  });
  if (!res.ok) throw new Error(`GitHub installation token failed (${res.status})`);
  const j = await res.json();
  return j.token as string;
}

/** Diagnostic: list every installation of this App (id + account + repo scope),
 *  so the correct installation id can be copied without guessing. */
export async function listInstallations(): Promise<{ id: number; account: string; scope: string }[]> {
  const res = await fetch(`${API}/app/installations`, { headers: ghHeaders(`Bearer ${appJwt()}`) });
  if (!res.ok) throw new Error(`GitHub list installations failed (${res.status}). Check GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY.`);
  const arr = (await res.json()) as { id: number; account?: { login?: string }; repository_selection?: string }[];
  return arr.map((i) => ({ id: i.id, account: i.account?.login ?? "?", scope: i.repository_selection ?? "?" }));
}

/** Fetch + parse the AI-BOM from a repo (for the in-app viewer). */
export async function fetchAiBom(
  cred: { installationId?: string; repo?: string; ref?: string },
): Promise<{ ok: boolean; htmlUrl?: string; path?: string; bom?: Record<string, unknown>; error?: string }> {
  if (!cred.installationId || !cred.repo) return { ok: false, error: "Connection missing installationId or repo." };
  let token: string;
  try { token = await installationToken(cred.installationId); }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "auth failed" }; }
  const headers = ghHeaders(`token ${token}`);

  const repoRes = await fetch(`${API}/repos/${cred.repo}`, { headers });
  if (!repoRes.ok) return { ok: false, error: `Repo ${cred.repo} is not accessible (${repoRes.status}).` };
  const ref = cred.ref || ((await repoRes.json()) as { default_branch?: string }).default_branch || "main";

  for (const path of AI_BOM_PATHS) {
    const r = await fetch(`${API}/repos/${cred.repo}/contents/${path}?ref=${encodeURIComponent(ref)}`, { headers });
    if (r.status === 404) continue;
    if (!r.ok) return { ok: false, error: `GitHub contents error (${r.status}).` };
    const file = await r.json();
    try {
      const bom = JSON.parse(Buffer.from(file.content ?? "", "base64").toString("utf8"));
      return { ok: true, htmlUrl: file.html_url, path, bom };
    } catch {
      return { ok: false, htmlUrl: file.html_url, path, error: `${path} is not valid JSON.` };
    }
  }
  return { ok: false, error: `No AI-BOM file found in ${cred.repo}.` };
}

/** Basic CycloneDX ML-BOM validation. Deepen later (full schema). */
function validateAiBom(json: unknown): { ok: boolean; reason: string; models: number } {
  const b = json as { bomFormat?: string; specVersion?: string; components?: { type?: string; modelCard?: unknown }[] };
  if (!b || b.bomFormat !== "CycloneDX") return { ok: false, reason: "Not a CycloneDX BOM.", models: 0 };
  if (!b.specVersion) return { ok: false, reason: "Missing specVersion.", models: 0 };
  const comps = Array.isArray(b.components) ? b.components : [];
  const models = comps.filter((c) => c?.type === "machine-learning-model" || c?.modelCard).length;
  if (comps.length === 0) return { ok: false, reason: "BOM has no components.", models: 0 };
  if (models === 0) return { ok: false, reason: "No ML model component (type 'machine-learning-model' / modelCard) — this is an SBOM, not an AI-BOM.", models: 0 };
  return { ok: true, reason: `Valid CycloneDX ML-BOM with ${models} model component(s).`, models };
}

export const githubConnector: Connector = {
  provider: "github",
  capabilities: () => ["ai_bom_present_and_valid"],

  async check(capability: string, params: Record<string, unknown>, ctx: ConnectorContext): Promise<CheckResult> {
    if (capability !== "ai_bom_present_and_valid") {
      return { result: "error", note: `github connector does not support ${capability}` };
    }
    const cred = (ctx.connection.credential ?? {}) as { installationId?: string; repo?: string };
    const repo = (params.repo as string) || cred.repo;
    if (!cred.installationId || !repo) {
      return { result: "error", note: "Connection missing installationId or repo.", remediationHint: "Reconnect the GitHub repo." };
    }

    let token: string;
    try {
      token = await installationToken(cred.installationId);
    } catch (e) {
      return { result: "error", note: e instanceof Error ? e.message : "auth failed" };
    }
    const headers = ghHeaders(`token ${token}`);

    // preflight: confirm the installation can read this repo + resolve its default branch
    // (GitHub returns 404 both for "no file" and "no access", so check access explicitly)
    const repoRes = await fetch(`${API}/repos/${repo}`, { headers });
    if (repoRes.status === 404) {
      return {
        result: "error",
        note: `Repo ${repo} is not accessible to the installation.`,
        remediationHint: `Install the Neo App on ${repo} with Contents: Read (or add the repo to the installation), then retry.`,
      };
    }
    if (!repoRes.ok) return { result: "error", note: `GitHub repo lookup failed (${repoRes.status}).` };
    const repoData = (await repoRes.json()) as { default_branch?: string };
    const ref = (params.ref as string) || repoData.default_branch || "main";

    // find the first AI-BOM path that exists on the default branch
    for (const path of AI_BOM_PATHS) {
      const r = await fetch(`${API}/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`, { headers });
      if (r.status === 404) continue;
      if (!r.ok) return { result: "error", note: `GitHub contents error (${r.status}) for ${path}` };
      const file = await r.json();
      const htmlUrl = file.html_url as string;
      let parsed: unknown;
      try {
        parsed = JSON.parse(Buffer.from(file.content ?? "", "base64").toString("utf8"));
      } catch {
        return {
          result: "fail", rawArtifactRef: htmlUrl, confidence: "high", triggerForRecheck: "repo_change",
          remediationHint: `${path} is not valid JSON — fix or regenerate the AI-BOM.`, policyDecision: "deny",
          note: `Found ${path} but it isn't parseable JSON.`,
        };
      }
      const v = validateAiBom(parsed);
      return {
        result: v.ok ? "pass" : "fail",
        normalizedEvidence: { path, models: v.models, format: "CycloneDX" },
        rawArtifactRef: htmlUrl,
        confidence: "high",
        triggerForRecheck: "repo_change",
        policyDecision: v.ok ? "allow" : "conditions",
        remediationHint: v.ok ? null : v.reason,
        note: v.reason,
      };
    }

    // none found
    return {
      result: "fail",
      confidence: "high",
      triggerForRecheck: "repo_change",
      policyDecision: "deny",
      remediationHint: `No AI-BOM found in ${repo}. Generate a CycloneDX ML-BOM (model lineage, dataset licenses, dependencies) and commit it (e.g. ai-bom.json).`,
      note: "No AI-BOM file present.",
    };
  },
};
