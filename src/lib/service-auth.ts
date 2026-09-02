import { createHash, randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { ApiError } from "@/lib/rbac";

/**
 * Service-token auth for the Neo agent's /api/agent/* endpoints (v2, DEMO ORGS ONLY).
 *
 * The agent (the orb / ambient layer) is a separate standalone service. It authenticates with a
 * per-org bearer token minted in the admin. We store only the SHA-256 hash. Every call is gated to
 * demo organizations — a non-demo org's token is rejected even if valid, because these are preview
 * features not yet available to customers.
 */
export interface ServiceContext {
  internalOrgId: string;
  tokenId: string;
  orgName: string | null;
}

export const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");
export const mintToken = () => "neo_svc_" + randomBytes(24).toString("base64url");

export async function requireServiceToken(req: Request): Promise<ServiceContext> {
  const header = req.headers.get("authorization") || "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) throw new ApiError(401, "Missing bearer token");
  const raw = m[1].trim();
  const sb = supabaseAdmin();

  const { data: tok } = await sb
    .from("service_tokens")
    .select("id, org_id, revoked")
    .eq("token_hash", hashToken(raw))
    .maybeSingle();
  if (!tok || tok.revoked) throw new ApiError(401, "Invalid or revoked token");

  const { data: org } = await sb
    .from("organizations")
    .select("id, name, is_demo")
    .eq("id", tok.org_id)
    .maybeSingle();
  if (!org) throw new ApiError(401, "Token org not found");
  if (!org.is_demo) throw new ApiError(403, "The Neo agent API is a preview feature, available to demo orgs only.");

  // best-effort last-used stamp (don't block the request on it)
  sb.from("service_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", tok.id).then(() => {});

  return { internalOrgId: org.id as string, tokenId: tok.id as string, orgName: (org.name as string) ?? null };
}
