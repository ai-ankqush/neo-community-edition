import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/server/identity/auth-context";
import { supabaseAdmin } from "@/lib/supabase";
import { getRecipe } from "@/server/fabric/recipes/registry";
import { getIntegration } from "@/lib/integrations-catalog";
import { planFor } from "@/lib/plans";
import RecipeSetup from "./recipe-setup";

export default async function ProviderIntegrationPage({ params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const { orgId, orgRole, internalOrgId } = await getAuthContext();
  if (!orgId || !internalOrgId) return <p className="text-[var(--muted)]">Select an organization first.</p>;
  const isAdmin = orgRole === "org:admin";
  const sb = supabaseAdmin();

  const { data: org } = await sb.from("organizations").select("is_demo, plan").eq("id", internalOrgId).single();
  if (!(planFor(org?.plan).integrations || org?.is_demo)) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <h2 className="text-lg font-bold">Integrations are a Starter feature</h2>
        <p className="mt-2 text-[13px] text-[var(--muted)]">Connected verification is included on Starter and Enterprise. Upgrade to connect this system.</p>
        <Link href="/dashboard/plans" className="mt-4 inline-block text-[13px] text-[#3b82f6]">View plans →</Link>
      </div>
    );
  }

  const recipe = getRecipe(provider);
  if (!recipe) notFound();

  // Roadmap connectors: a recipe exists (so Neo can test it on a demo org) but
  // it stays gated for customers until live-validated.
  const catalogEntry = getIntegration(provider);
  if (catalogEntry?.status === "coming_soon" && !org?.is_demo) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <h2 className="text-lg font-bold">{recipe.name} is coming soon</h2>
        <p className="mt-2 text-[13px] text-[var(--muted)]">This connector is on the roadmap — built and being validated. We&apos;ll switch it on shortly.</p>
        <Link href="/dashboard/integrations" className="mt-4 inline-block text-[13px] text-[#3b82f6]">← Back to Integrations</Link>
      </div>
    );
  }

  const { data: connections } = await sb
    .from("org_connections").select("id, label, status")
    .eq("org_id", internalOrgId).eq("provider", provider).neq("status", "revoked")
    .order("created_at", { ascending: true });

  // serializable view of the recipe (no functions cross the client boundary)
  const view = {
    id: recipe.id,
    name: recipe.name,
    category: recipe.category,
    summary: recipe.summary,
    maturity: recipe.maturity,
    fields: recipe.auth.fields,
    setup: recipe.auth.setup,
    scopes: recipe.auth.scopes,
    trustTemplate: recipe.trustTemplate ?? null,
    capabilities: recipe.capabilities.map((c) => ({ capabilityId: c.capabilityId, label: c.label })),
  };

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/dashboard/integrations" className="text-[12px] text-[var(--faint)] hover:text-[#3b82f6]">← Integrations</Link>
      <div className="mt-2 flex items-center gap-2.5">
        <h2 className="text-xl font-bold">Connect {recipe.name}</h2>
        {recipe.maturity === "authored_untested" && (
          <span className="rounded bg-[#f59e0b14] px-2 py-0.5 text-[10px] font-bold uppercase text-[#f59e0b]">Beta · unverified</span>
        )}
      </div>
      <p className="mt-1 text-[13px] text-[var(--faint)]">{recipe.summary} Read-only.</p>

      <RecipeSetup
        view={view}
        connections={(connections ?? []) as { id: string; label: string | null; status: string }[]}
        canManage={isAdmin}
        neoAwsAccountId={process.env.NEXT_PUBLIC_NEO_AWS_ACCOUNT_ID ?? null}
      />
    </div>
  );
}
