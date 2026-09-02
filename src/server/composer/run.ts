import "server-only";
import dns from "node:dns/promises";
import { validateReadOnly, isPrivateHost, evaluateAssertion, type Assertion, type EvalResult } from "@/lib/composer";

/** Executes a composed check inside the read-only sandbox:
 *   1. build the request from the connector + check,
 *   2. validate it is read-only and on the declared host,
 *   3. DNS-resolve and reject private/metadata IPs (anti-SSRF / DNS-rebinding),
 *   4. fetch with a timeout and response-size cap,
 *   5. evaluate the response against the assertion (deterministic).
 *  Never writes, never follows off-host redirects, never logs the credential. */

export interface ComposerConnector { base_url: string; host: string; auth_type: string; credential: Record<string, string> | null }
export interface ComposerCheck { method: string; path: string; query: Record<string, string> | null; assertion: Assertion }

const TIMEOUT_MS = 12_000;
const MAX_BYTES = 512 * 1024;

function buildUrl(c: ComposerConnector, chk: ComposerCheck): string {
  const base = c.base_url.replace(/\/+$/, "");
  const path = chk.path.startsWith("/") ? chk.path : `/${chk.path}`;
  const u = new URL(base + path);
  for (const [k, v] of Object.entries(chk.query ?? {})) u.searchParams.set(k, v);
  // most read-only APIs return JSON when asked
  if (!u.searchParams.has("output_mode")) { /* leave as-is unless caller set it */ }
  return u.toString();
}

function authHeaders(c: ComposerConnector, bearer?: string): Record<string, string> {
  const cred = c.credential ?? {};
  if (c.auth_type === "oauth2_client_credentials") return bearer ? { Authorization: `Bearer ${bearer}` } : {};
  if (c.auth_type === "custom_header" && cred.header_name) return { [cred.header_name]: cred.header_value ?? "" };
  if (cred.token) return { Authorization: `Bearer ${cred.token}` };
  return {};
}

/** OAuth 2.0 client-credentials: exchange client_id+secret at the token endpoint for a short-lived
 *  access token (e.g. Azure management API). The token endpoint is the IdP's own URL — still https
 *  and SSRF-checked. Never logs the secret or the token. */
async function fetchOAuthToken(cred: Record<string, string>): Promise<{ token?: string; error?: string }> {
  const tokenUrl = (cred.token_url ?? "").trim();
  if (!/^https:\/\/.+/i.test(tokenUrl)) return { error: "missing or non-https token URL" };
  try {
    const { hostname } = new URL(tokenUrl);
    const addrs = await dns.lookup(hostname, { all: true });
    if (addrs.some((a) => isPrivateHost(a.address))) return { error: "token endpoint resolved to an internal address" };
  } catch { return { error: "couldn't resolve the token endpoint" }; }

  const body = new URLSearchParams({ grant_type: "client_credentials", client_id: cred.client_id ?? "", client_secret: cred.client_secret ?? "" });
  if (cred.scope) body.set("scope", cred.scope);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body, redirect: "manual", signal: ctrl.signal,
    });
    const text = await res.text();
    let j: { access_token?: string } | null = null;
    try { j = JSON.parse(text) as { access_token?: string }; } catch { j = null; }
    if (!res.ok || !j?.access_token) return { error: `token request failed (HTTP ${res.status})` };
    return { token: j.access_token };
  } catch { return { error: "couldn't reach the token endpoint" }; } finally { clearTimeout(t); }
}

export async function runComposedCheck(connector: ComposerConnector, check: ComposerCheck): Promise<EvalResult & { httpStatus: number; error?: string }> {
  const url = buildUrl(connector, check);
  const ro = validateReadOnly(check.method, url, connector.host);
  if (!ro.ok) return { state: "unable_to_determine", findings: [], summary: ro.reason ?? "Blocked by the read-only sandbox.", httpStatus: 0, error: ro.reason };

  // OAuth client-credentials: get a fresh short-lived token before the read-only call
  let bearer: string | undefined;
  if (connector.auth_type === "oauth2_client_credentials") {
    const tok = await fetchOAuthToken(connector.credential ?? {});
    if (tok.error || !tok.token) return { state: "unable_to_determine", findings: [], summary: `Couldn't authenticate with the system: ${tok.error ?? "no token returned"}.`, httpStatus: 0, error: "oauth_failed" };
    bearer = tok.token;
  }

  // anti-SSRF: resolve and reject private addresses (catches DNS rebinding to internal IPs)
  try {
    const { hostname } = new URL(url);
    const addrs = await dns.lookup(hostname, { all: true });
    if (addrs.some((a) => isPrivateHost(a.address))) return { state: "unable_to_determine", findings: [], summary: "The target resolved to an internal address — blocked.", httpStatus: 0, error: "ssrf_blocked" };
  } catch { return { state: "unable_to_determine", findings: [], summary: "Neo couldn't resolve that host.", httpStatus: 0, error: "dns_failed" }; }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: check.method.toUpperCase(),
      headers: { Accept: "application/json", ...authHeaders(connector, bearer) },
      redirect: "manual",                 // never follow redirects off-host
      signal: ctrl.signal,
    });
    if (res.status >= 300 && res.status < 400) return { state: "unable_to_determine", findings: [], summary: "The system redirected the request — Neo won't follow it for safety.", httpStatus: res.status, error: "redirect_blocked" };

    // size-capped read
    const reader = res.body?.getReader();
    let received = 0; const chunks: Uint8Array[] = [];
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.length;
        if (received > MAX_BYTES) { ctrl.abort(); break; }
        chunks.push(value);
      }
    }
    const text = new TextDecoder().decode(concat(chunks));
    let body: unknown = null;
    try { body = JSON.parse(text); } catch { body = null; }
    return { ...evaluateAssertion(res.status, body, check.assertion), httpStatus: res.status };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return { state: "unable_to_determine", findings: [], summary: aborted ? "The check timed out." : "Neo couldn't reach the system.", httpStatus: 0, error: aborted ? "timeout" : "fetch_failed" };
  } finally { clearTimeout(t); }
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const len = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
