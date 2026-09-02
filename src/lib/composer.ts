/** Neo Integration Composer — deterministic core (pure, client-safe, no I/O).
 *
 *  The Composer lets Neo VERIFY a control live against a customer system it didn't pre-build a
 *  connector for. Ask Neo composes a read-only request + an ASSERTION; this module (a) validates
 *  the request is genuinely read-only and on the declared host (sandbox), and (b) evaluates the
 *  response against the assertion to a result state — deterministically, never an LLM at runtime.
 *
 *  Honesty rules baked in: an ambiguous or permission-blocked response is NEVER a pass, and the
 *  9 detailed states roll up to the platform's verified/partial/missing so Supply Chain, Red Team
 *  and the confidence ladder stay consistent. See docs/NEO-INTEGRATION-COMPOSER-SPEC.md. */

export type ResultState =
  | "verified" | "exists_not_verified" | "exists_misconfigured" | "exists_disabled"
  | "partially_verified" | "not_found" | "permission_blocked" | "unable_to_determine" | "not_applicable";

export type RollupStatus = "verified" | "partial" | "missing" | "na";

export const STATE_LABEL: Record<ResultState, string> = {
  verified: "Verified", exists_not_verified: "Exists but not verified", exists_misconfigured: "Exists but misconfigured",
  exists_disabled: "Exists but disabled", partially_verified: "Partially verified", not_found: "Not found",
  permission_blocked: "Permission blocked", unable_to_determine: "Unable to determine", not_applicable: "Not applicable",
};

/** Detailed state → the 3 statuses the rest of the platform consumes. Permission-blocked and
 *  unable-to-determine are "not proven" — they roll to missing, NEVER to verified. */
export function rollup(s: ResultState): RollupStatus {
  switch (s) {
    case "verified": return "verified";
    case "exists_not_verified": case "exists_misconfigured": case "exists_disabled": case "partially_verified": return "partial";
    case "not_found": case "permission_blocked": case "unable_to_determine": return "missing";
    case "not_applicable": return "na";
  }
}

export type Dimension = "exists" | "enabled" | "scoped" | "configured" | "operational";
export type Op = "exists" | "not_empty" | "truthy" | "eq" | "neq" | "gt" | "gte" | "contains" | "matches";

/** One thing to read from the response and what it proves. `path` is a dot path with `[*]`
 *  (any element) / `[n]` support, e.g. `entry[*].content.disabled`. */
export interface Condition {
  label: string;                 // plain-English, shown to the user
  path: string;
  op: Op;
  value?: string | number | boolean;
  proves: Dimension;
  negate?: boolean;              // e.g. disabled==false → "enabled"
}

export interface Assertion { conditions: Condition[] }

export interface EvalFinding { label: string; pass: boolean; proves: Dimension }
export interface EvalResult { state: ResultState; findings: EvalFinding[]; summary: string }

// ── read-only sandbox validation (URL/method; the runner adds DNS-resolved IP checks) ──
const SAFE_METHODS = new Set(["GET", "HEAD"]);

export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h === "metadata.google.internal") return true;
  if (h === "169.254.169.254" || h === "::1" || h === "[::1]") return true;
  if (/^127\.|^10\.|^192\.168\.|^169\.254\.|^0\.0\.0\.0$/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^(fc|fd)[0-9a-f]{2}:/.test(h) || /^fe80:/.test(h)) return true; // IPv6 ULA / link-local
  return false;
}

export function validateReadOnly(method: string, urlStr: string, allowedHost: string | null, opts: { allowQueryPost?: boolean } = {}): { ok: boolean; reason?: string } {
  const m = (method || "GET").toUpperCase();
  if (!SAFE_METHODS.has(m) && !(m === "POST" && opts.allowQueryPost)) return { ok: false, reason: "Only read-only requests are allowed (GET/HEAD, or an explicitly safe query POST)." };
  let url: URL;
  try { url = new URL(urlStr); } catch { return { ok: false, reason: "The request URL is not valid." }; }
  if (url.protocol !== "https:") return { ok: false, reason: "Only secure https requests are allowed." };
  if (allowedHost && url.hostname.toLowerCase() !== allowedHost.toLowerCase()) return { ok: false, reason: `Requests must stay on ${allowedHost}.` };
  if (isPrivateHost(url.hostname)) return { ok: false, reason: "Internal, loopback, or cloud-metadata hosts are blocked." };
  return { ok: true };
}

// ── JSON path getter: dot path with [*] (all elements) and [n] ──
export function getPath(obj: unknown, path: string): unknown[] {
  let nodes: unknown[] = [obj];
  for (const rawSeg of path.split(".")) {
    const seg = rawSeg.trim();
    if (!seg) continue;
    const m = seg.match(/^([^[]*)((?:\[[^\]]*\])*)$/);
    const key = m ? m[1] : seg;
    const idx = m ? m[2] : "";
    if (key) nodes = nodes.flatMap((n) => (n && typeof n === "object" && key in (n as object)) ? [(n as Record<string, unknown>)[key]] : []);
    for (const im of idx.matchAll(/\[([^\]]*)\]/g)) {
      const inner = im[1].trim();
      if (inner === "*" || inner === "") nodes = nodes.flatMap((n) => (Array.isArray(n) ? n : []));
      else { const i = Number(inner); nodes = nodes.flatMap((n) => (Array.isArray(n) && i >= 0 && i < n.length ? [n[i]] : [])); }
    }
  }
  return nodes.filter((n) => n !== undefined);
}

function condPass(c: Condition, values: unknown[]): boolean {
  const truthy = (v: unknown) => v !== null && v !== undefined && v !== false && v !== 0 && v !== "" && !(Array.isArray(v) && v.length === 0);
  let pass: boolean;
  switch (c.op) {
    case "exists": pass = values.length > 0; break;
    case "not_empty": pass = values.some(truthy); break;
    case "truthy": pass = values.some(truthy); break;
    case "eq": pass = values.some((v) => v === c.value || String(v) === String(c.value)); break;
    case "neq": pass = values.length > 0 && values.every((v) => v !== c.value && String(v) !== String(c.value)); break;
    case "gt": pass = values.some((v) => Number(v) > Number(c.value)); break;
    case "gte": pass = values.some((v) => Number(v) >= Number(c.value)); break;
    case "contains": pass = values.some((v) => String(v).toLowerCase().includes(String(c.value).toLowerCase())); break;
    case "matches": { let re: RegExp | null = null; try { re = new RegExp(String(c.value), "i"); } catch { re = null; } pass = re ? values.some((v) => re!.test(String(v))) : false; break; }
    default: pass = false;
  }
  return c.negate ? !pass : pass;
}

/** Evaluate an HTTP result against the assertion → a deterministic result state. */
export function evaluateAssertion(httpStatus: number, body: unknown, a: Assertion): EvalResult {
  if (httpStatus === 401 || httpStatus === 403) return { state: "permission_blocked", findings: [], summary: "The connector did not have permission to read this — Neo can't confirm the control." };
  if (httpStatus === 404) {
    // 404 with an exists-condition means the object isn't there; otherwise it's a bad request
    const hasExists = a.conditions.some((c) => c.proves === "exists");
    return hasExists ? { state: "not_found", findings: a.conditions.map((c) => ({ label: c.label, pass: false, proves: c.proves })), summary: "Neo could not find the required control in the system." }
      : { state: "unable_to_determine", findings: [], summary: "The system returned 'not found' for this request — Neo can't determine the control state." };
  }
  if (httpStatus >= 400 || body == null) return { state: "unable_to_determine", findings: [], summary: "The system's response was incomplete or ambiguous — Neo can't determine the control state." };

  const findings: EvalFinding[] = a.conditions.map((c) => ({ label: c.label, pass: condPass(c, getPath(body, c.path)), proves: c.proves }));

  const present = new Set(findings.map((f) => f.proves));
  const satisfied = (d: Dimension) => { const fs = findings.filter((f) => f.proves === d); return fs.length > 0 && fs.every((f) => f.pass); };
  const dimsSatisfied = (["exists", "enabled", "scoped", "configured", "operational"] as Dimension[]).filter((d) => present.has(d) && satisfied(d));

  let state: ResultState;
  if (present.has("exists") && !satisfied("exists")) state = "not_found";
  else if (present.has("enabled") && !satisfied("enabled")) state = "exists_disabled";
  else if (present.has("configured") && !satisfied("configured")) state = "exists_misconfigured";
  else if (dimsSatisfied.length === present.size) state = "verified";
  else if (dimsSatisfied.length === 1 && present.has("exists") && satisfied("exists")) state = "exists_not_verified";
  else state = "partially_verified";

  const ok = findings.filter((f) => f.pass).length, total = findings.length;
  const summary = state === "verified" ? "All required checks passed — the control is verified live."
    : `${ok} of ${total} checks passed. ${STATE_LABEL[state]}.`;
  return { state, findings, summary };
}
