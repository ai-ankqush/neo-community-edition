import "server-only";
import crypto from "crypto";
import type { ProviderClient, ProviderRecipe } from "../recipes/types";
import { signRequest, assumeRole, type AwsCreds } from "./sigv4";

/** Build an authed ProviderClient from a recipe's auth method + a connection's
 *  stored credential. Check/preflight fns talk only to ProviderClient. */
const subst = (tpl: string | undefined, cred: Record<string, unknown>) =>
  (tpl ?? "").replace(/\{(\w+)\}/g, (_, k) => String(cred[k] ?? ""));

export async function buildClient(
  recipe: ProviderRecipe,
  credential: Record<string, unknown>,
): Promise<ProviderClient> {
  const cred = credential ?? {};
  const baseUrl = subst(recipe.auth.baseUrlTemplate, cred) || String(cred.baseUrl ?? "");
  const tokenUrl = subst(recipe.auth.tokenUrlTemplate, cred) || String(cred.tokenUrl ?? "");
  const scope = recipe.auth.scope ?? (cred.scope ? String(cred.scope) : undefined);

  switch (recipe.auth.method) {
    case "api_token":
      return staticTokenClient(baseUrl, cred);
    case "oauth2_client_credentials":
      return await oauthClient(baseUrl, { ...cred, tokenUrl, scope });
    case "gcp_service_account":
      return await gcpClient(baseUrl, { ...cred, scope });
    case "aws_role":
      return await awsClient(cred);
    default:
      throw new Error(`Unsupported auth method ${recipe.auth.method}`);
  }
}

const b64 = (s: string) => Buffer.from(s).toString("base64");
const b64url = (b: Buffer | string) =>
  Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function makeClient(baseUrl: string, headers: Record<string, string>): ProviderClient {
  return {
    baseUrl,
    async request(path, init) {
      const url = path.startsWith("http") ? path : baseUrl.replace(/\/$/, "") + path;
      return fetch(url, { ...init, headers: { ...headers, ...(init?.headers as Record<string, string>) } });
    },
  };
}

/** API token / Basic. cred: { baseUrl, token, scheme?, basicUser? }
 *  Custom-header providers (Anthropic, LangSmith, Vault, Datadog) set:
 *   - authHeaderName: put the primary token in this header instead of Authorization
 *     (value = `${scheme} ${token}` if scheme set, else the bare token).
 *   - staticHeaders: JSON string of fixed headers (e.g. {"anthropic-version":"2023-06-01"}).
 *   - fieldHeaders: JSON string mapping headerName -> credential field key, for a
 *     second user-supplied secret (e.g. {"DD-APPLICATION-KEY":"appKey"}). */
function staticTokenClient(baseUrl: string, cred: Record<string, unknown>): ProviderClient {
  const token = String(cred.token ?? "");
  const headers: Record<string, string> = { Accept: "application/json" };

  const authHeaderName = cred.authHeaderName ? String(cred.authHeaderName) : null;
  if (cred.basicUser) {
    headers.Authorization = `Basic ${b64(`${cred.basicUser}:${token}`)}`;
  } else if (authHeaderName) {
    const prefix = cred.scheme ? `${String(cred.scheme)} ` : "";
    headers[authHeaderName] = `${prefix}${token}`;
  } else {
    headers.Authorization = `${String(cred.scheme ?? "Bearer")} ${token}`;
  }

  if (cred.staticHeaders) {
    try { Object.assign(headers, JSON.parse(String(cred.staticHeaders)) as Record<string, string>); } catch { /* ignore */ }
  }
  if (cred.fieldHeaders) {
    try {
      const map = JSON.parse(String(cred.fieldHeaders)) as Record<string, string>;
      for (const [header, key] of Object.entries(map)) headers[header] = String(cred[key] ?? "");
    } catch { /* ignore */ }
  }
  return makeClient(baseUrl, headers);
}

/** OAuth2 client-credentials. cred: { baseUrl, tokenUrl, clientId, clientSecret, scope? } */
async function oauthClient(baseUrl: string, cred: Record<string, unknown>): Promise<ProviderClient> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: String(cred.clientId ?? ""),
    client_secret: String(cred.clientSecret ?? ""),
    ...(cred.scope ? { scope: String(cred.scope) } : {}),
  });
  const res = await fetch(String(cred.tokenUrl ?? ""), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error(`OAuth token exchange failed (${res.status})`);
  return makeClient(baseUrl, { Authorization: `Bearer ${j.access_token}`, Accept: "application/json" });
}

/** GCP service-account JWT → token. cred: { baseUrl, clientEmail, privateKey, scope, tokenUri?, subject? } */
async function gcpClient(baseUrl: string, cred: Record<string, unknown>): Promise<ProviderClient> {
  const tokenUri = String(cred.tokenUri ?? "https://oauth2.googleapis.com/token");
  const pem = String(cred.privateKey ?? "").replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const claim: Record<string, unknown> = {
    iss: cred.clientEmail,
    scope: cred.scope,
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  };
  if (cred.subject) claim.sub = cred.subject; // domain-wide delegation (Workspace)
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify(claim));
  const sig = b64url(crypto.createSign("RSA-SHA256").update(`${header}.${payload}`).sign(pem));
  const jwt = `${header}.${payload}.${sig}`;

  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }).toString(),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error(`GCP token exchange failed (${res.status})`);
  return makeClient(baseUrl, { Authorization: `Bearer ${j.access_token}`, Accept: "application/json" });
}

/** AWS cross-account read-only. cred: { roleArn, externalId, region }. Neo base
 *  creds come from env. Each request is SigV4-signed; service+region are derived
 *  from the request host (e.g. cloudtrail.us-east-1.amazonaws.com). */
async function awsClient(cred: Record<string, unknown>): Promise<ProviderClient> {
  const baseCreds: AwsCreds = {
    accessKeyId: process.env.NEO_AWS_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.NEO_AWS_SECRET_ACCESS_KEY ?? "",
  };
  if (!baseCreds.accessKeyId || !baseCreds.secretAccessKey) {
    throw new Error("Neo AWS base credentials not configured (NEO_AWS_ACCESS_KEY_ID / NEO_AWS_SECRET_ACCESS_KEY).");
  }
  const region = String(cred.region ?? "us-east-1");
  const temp = await assumeRole({
    baseCreds,
    roleArn: String(cred.roleArn ?? ""),
    externalId: String(cred.externalId ?? ""),
    region,
  });

  return {
    baseUrl: "",
    async request(path, init) {
      const url = path.startsWith("http") ? path : `https://${path}`;
      const host = new URL(url).host; // e.g. cloudtrail.us-east-1.amazonaws.com
      const service = host.split(".")[0];
      const hostRegion = host.split(".")[1] && host.split(".")[1] !== "amazonaws" ? host.split(".")[1] : region;
      const body = typeof init?.body === "string" ? init.body : "";
      const { headers } = signRequest({
        creds: temp, region: hostRegion, service,
        method: init?.method ?? "GET", url,
        headers: init?.headers as Record<string, string>, body,
      });
      return fetch(url, { ...init, headers });
    },
  };
}
