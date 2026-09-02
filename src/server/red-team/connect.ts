import "server-only";
import type { AttackProbe } from "./batteries";

/**
 * Target connector — how Live Fire reaches the AI under test. REAL ONLY.
 *
 *   endpoint : POST the probe to a customer-managed model/agent URL (needs a connection).
 *   public   : POST the probe to a public endpoint (open to the world).
 *   mcp      : attack an HTTP (Streamable-HTTP) MCP server through its tool surface —
 *              initialize → tools/list → tools/call, sending the probe as a tool argument.
 *              This hits the agent the way it really runs, so the governed proxy would mediate it.
 *
 * Live Fire never fabricates a response. If there's no reachable real target, the
 * step returns an error — seeing the attacks without a live system is what the
 * Simulation tab is for.
 *
 * SAFETY: attempt-and-detect. We only send the probe text and read the reply; we
 * never carry a real destructive payload or exfil sink. Endpoint is SSRF-guarded
 * (no private / loopback / metadata addresses).
 */

export type TargetMethod = "endpoint" | "public" | "mcp";

export interface TargetSpec {
  method: TargetMethod;
  url?: string | null;          // for endpoint / public / mcp (the MCP server's HTTP URL)
  label?: string | null;
  headerName?: string | null;   // optional auth header (value from server env / connection, never logged)
  headerValue?: string | null;
  mcpTool?: string | null;      // MCP: which tool to attack (optional — auto-discovered if absent)
}

export interface ProbeResult {
  reply: string;
  error?: string;
}

const PRIVATE_HOST = /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|::1|\[?::1\]?|metadata\.google|169\.254\.169\.254)/i;

function endpointAllowed(raw: string): URL | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (PRIVATE_HOST.test(u.hostname)) return null;         // block SSRF to internal/metadata
    if (/^(172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname)) return null; // 172.16/12
    return u;
  } catch {
    return null;
  }
}

export async function sendProbe(target: TargetSpec, probe: AttackProbe, timeoutMs = 12000): Promise<ProbeResult> {
  if (target.method === "mcp") {
    return sendViaMcp(target, probe, timeoutMs);
  }
  if (!target.url) {
    return { reply: "", error: "No live target — give a target URL, or use Simulation to see the attacks without a live system." };
  }
  const u = endpointAllowed(target.url);
  if (!u) return { reply: "", error: "Target URL rejected (must be a public http(s) endpoint; internal/metadata addresses are blocked)." };

  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (target.headerName && target.headerValue) headers[target.headerName] = target.headerValue;
    const res = await fetch(u.toString(), {
      method: "POST",
      headers,
      body: JSON.stringify({ input: probe.prompt, prompt: probe.prompt, messages: [{ role: "user", content: probe.prompt }] }),
      signal: ctl.signal,
    });
    const text = await res.text();
    if (!res.ok) return { reply: "", error: `Target returned ${res.status}` };
    let reply = text;
    try {
      const j = JSON.parse(text);
      reply = j.output ?? j.reply ?? j.text ?? j.content ?? j.completion ??
        (Array.isArray(j.choices) ? j.choices[0]?.message?.content ?? j.choices[0]?.text : null) ?? text;
      if (typeof reply !== "string") reply = JSON.stringify(reply);
    } catch { /* plain text */ }
    return { reply: String(reply).slice(0, 8000) };
  } catch (e) {
    return { reply: "", error: e instanceof Error && e.name === "AbortError" ? "Target timed out" : "Target unreachable" };
  } finally {
    clearTimeout(t);
  }
}

// ── MCP (Streamable-HTTP) attack path ──────────────────────────────────────
// Attack an HTTP MCP server through its own tool surface. Same attempt-and-detect
// safety and SSRF guard as the endpoint path; no destructive payloads.
type Json = Record<string, unknown>;

function parseMaybeSse(text: string): Json | null {
  const s = text.trim();
  if (s.startsWith("{") || s.startsWith("[")) { try { return JSON.parse(s) as Json; } catch { return null; } }
  // Streamable HTTP may answer as SSE; the last `data:` line carries the JSON-RPC message.
  const data = s.split(/\r?\n/).filter((l) => l.startsWith("data:"));
  for (let i = data.length - 1; i >= 0; i--) { try { return JSON.parse(data[i].slice(5).trim()) as Json; } catch { /* keep looking */ } }
  return null;
}

async function mcpRpc(url: URL, headers: Record<string, string>, body: Json, timeoutMs: number): Promise<{ result?: Json; error?: string; sessionId?: string }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
      body: JSON.stringify({ jsonrpc: "2.0", ...body }),
      signal: ctl.signal,
    });
    const sessionId = res.headers.get("mcp-session-id") ?? undefined;
    const text = await res.text();
    if (!res.ok) return { error: `MCP server returned ${res.status}`, sessionId };
    const payload = parseMaybeSse(text);
    if (payload && payload.error) return { error: `MCP error: ${((payload.error as Json)?.message as string) ?? "unknown"}`, sessionId };
    return { result: (payload?.result as Json) ?? undefined, sessionId };
  } catch (e) {
    return { error: e instanceof Error && e.name === "AbortError" ? "MCP server timed out" : "MCP server unreachable" };
  } finally {
    clearTimeout(t);
  }
}

// Choose which tool to attack and which argument to carry the probe.
function pickTool(tools: Json[], preferred?: string | null): { name: string; argKey: string } | null {
  if (!tools.length) return null;
  const rx = /prompt|message|query|question|ask|chat|input|text|search|complete/i;
  const chosen = (preferred && tools.find((t) => t.name === preferred))
    || tools.find((t) => rx.test(`${t.name ?? ""} ${t.description ?? ""}`))
    || tools[0];
  const schema = (chosen.inputSchema ?? chosen.input_schema) as Json | undefined;
  const props = (schema?.properties as Json | undefined) ?? {};
  const keys = Object.keys(props);
  const argKey = keys.find((k) => /prompt|message|query|question|input|text|content/i.test(k))
    || keys.find((k) => ((props[k] as Json)?.type as string) === "string")
    || keys[0] || "input";
  return { name: String(chosen.name ?? ""), argKey };
}

async function sendViaMcp(target: TargetSpec, probe: AttackProbe, timeoutMs: number): Promise<ProbeResult> {
  if (!target.url) return { reply: "", error: "No MCP endpoint — give the MCP server's HTTP URL, or run this in Simulation." };
  const u = endpointAllowed(target.url);
  if (!u) return { reply: "", error: "MCP URL rejected (must be a public http(s) endpoint; internal/metadata addresses are blocked)." };

  const auth: Record<string, string> = {};
  if (target.headerName && target.headerValue) auth[target.headerName] = target.headerValue;

  // initialize (best-effort — some servers accept tools/* without it); carry any session id forward
  const init = await mcpRpc(u, auth, { id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "neo-red-team", version: "1.0" } } }, timeoutMs);
  const h = init.sessionId ? { ...auth, "mcp-session-id": init.sessionId } : auth;
  if (init.sessionId) await mcpRpc(u, h, { method: "notifications/initialized", params: {} }, timeoutMs);

  const list = await mcpRpc(u, h, { id: 2, method: "tools/list", params: {} }, timeoutMs);
  if (list.error) return { reply: "", error: list.error };
  const tools = ((list.result?.tools as Json[]) ?? []);
  const pick = pickTool(tools, target.mcpTool);
  if (!pick) return { reply: "", error: "MCP server exposes no tools to attack." };

  const call = await mcpRpc(u, h, { id: 3, method: "tools/call", params: { name: pick.name, arguments: { [pick.argKey]: probe.prompt } } }, timeoutMs);
  if (call.error) return { reply: "", error: call.error };
  const content = ((call.result?.content as Json[]) ?? []);
  const reply = content.map((c) => (typeof c.text === "string" ? c.text : "")).join("\n").trim()
    || JSON.stringify(call.result?.structuredContent ?? call.result ?? "");
  return { reply: String(reply).slice(0, 8000) };
}
