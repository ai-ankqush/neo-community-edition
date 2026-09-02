import { NextRequest, NextResponse } from "next/server";
import { requireRole, ApiError } from "@/lib/rbac";
import { supabaseAdmin } from "@/lib/supabase";
import { requireFabricEnabled } from "@/server/fabric/gate";
import { getRecipe } from "@/server/fabric/recipes/registry";

export const dynamic = "force-dynamic";

/** POST /api/connections — connect a system once per org (admin only).
 *  GitHub uses its native App connector; all other providers are recipe-driven:
 *  the recipe declares its credential fields and we store exactly those. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole("org_admin");
    await requireFabricEnabled(session.internalOrgId);
    const body = await req.json().catch(() => ({}));
    const provider = String(body.provider ?? "").trim();
    const sb = supabaseAdmin();

    if (provider === "github") {
      const repo = String(body.repo ?? "").trim();
      const installationId = String(body.installationId ?? "").trim();
      if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new ApiError(400, "Repo must be in owner/name form.");
      if (!/^\d+$/.test(installationId)) throw new ApiError(400, "Installation id must be numeric.");
      const { error } = await sb.from("org_connections").upsert(
        { org_id: session.internalOrgId, provider, label: repo, status: "connected",
          scopes: "contents:read", credential: { installationId, repo },
          connected_by: session.userId, updated_at: new Date().toISOString() },
        { onConflict: "org_id,provider,label" });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    const recipe = getRecipe(provider);
    if (!recipe) throw new ApiError(400, "Unsupported provider.");

    // start with recipe defaults (e.g. fixed auth scheme), then user fields
    const credential: Record<string, string> = { ...(recipe.auth.defaults ?? {}) };
    for (const f of recipe.auth.fields) {
      const v = String(body[f.key] ?? "").trim();
      // A placeholder is a UI hint, never a default — required unless explicitly optional.
      if (!v && !f.optional) throw new ApiError(400, `Missing ${f.label || f.key}.`);
      if (v) credential[f.key] = v;
    }
    // Forgiving normalization: users often paste a full URL/domain for a subdomain field.
    const hostField = (s: string) => s.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").trim();
    if (credential.site) credential.site = hostField(credential.site).replace(/\.atlassian\.net$/i, "");
    if (credential.instance) credential.instance = hostField(credential.instance).replace(/\.service-now\.com$/i, "");
    if (credential.baseUrl && /splunkcloud\.com|:8089/i.test(credential.baseUrl)) {
      credential.baseUrl = credential.baseUrl.replace(/\/+$/, "");
    }
    // Org-scoped (multi-account) connection: management account is the entry point; Neo fans out
    // to member accounts. The external id is promoted to its own column for org reuse.
    const scopeLevel = String(body.scopeLevel ?? "account") === "org" ? "org" : "account";
    const accountRef = body.accountRef ? String(body.accountRef).trim() : null;
    const label =
      (scopeLevel === "org" && accountRef ? `AWS Org ${accountRef}` : null) ||
      credential.baseUrl || credential.instance || credential.site ||
      credential.projectId || credential.subscriptionId || credential.roleArn || recipe.name;

    const { error } = await sb.from("org_connections").upsert(
      { org_id: session.internalOrgId, provider, label, status: "connected",
        scopes: recipe.auth.scopes.join(", "), credential,
        scope_level: scopeLevel, account_ref: accountRef,
        external_id: credential.externalId ?? null,
        connected_by: session.userId, updated_at: new Date().toISOString() },
      { onConflict: "org_id,provider,label" });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("CONNECTION CREATE ERROR", err);
    return NextResponse.json({ error: "Could not save connection" }, { status: 500 });
  }
}
