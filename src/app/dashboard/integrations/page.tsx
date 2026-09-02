import Link from "next/link";
import { getAuthContext } from "@/server/identity/auth-context";
import { auth } from "@clerk/nextjs/server";
import { ensureOrg } from "@/lib/org";
import { supabaseAdmin } from "@/lib/supabase";
import { Card } from "@/components/console/ui";
import { BrandMark } from "@/components/console/brand-mark";
import { INTEGRATIONS } from "@/lib/integrations-catalog";
import { isCommunity } from "@/ce/edition";
import { planFor } from "@/lib/plans";
import { BRAND } from "@/lib/brand";

export default async function IntegrationsPage() {
  const { orgId } = await getAuthContext();
  if (!orgId) return <p className="text-[var(--muted)]">Select an organization first.</p>;
  const internalOrgId = (await getAuthContext()).internalOrgId as string;
  const sb = supabaseAdmin();

  const { data: org } = await sb.from("organizations").select("is_demo, plan").eq("id", internalOrgId).single();
  // Available to plans with the integrations feature (Starter+); demo accounts always.
  if (!(planFor(org?.plan).integrations || org?.is_demo)) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <h2 className="text-lg font-bold">Integrations are a Starter feature</h2>
        <p className="mt-2 text-[13px] text-[var(--muted)]">
          Connected verification — reading your systems to confirm control evidence automatically — is
          included on Starter and Enterprise. Upgrade to connect your systems and verify controls live.
        </p>
        <Link href="/dashboard/plans" className="mt-4 inline-block text-[13px] text-[#3b82f6]">View plans →</Link>
      </div>
    );
  }

  const { data: conns } = await sb
    .from("org_connections")
    .select("provider, label, status")
    .eq("org_id", internalOrgId).neq("status", "revoked");

  const byProvider = new Map<string, { count: number; label: string | null }>();
  for (const c of conns ?? []) {
    const cur = byProvider.get(c.provider) ?? { count: 0, label: null };
    byProvider.set(c.provider, { count: cur.count + 1, label: cur.label ?? c.label });
  }

  const isDemo = Boolean(org?.is_demo);
  const community = isCommunity();
  const availableNow = INTEGRATIONS.filter((i) => i.status === "available" && !i.validating);
  // Community Edition: no central "validating"/roadmap catalog — compose any connector via the Composer.
  const validating = community ? [] : INTEGRATIONS.filter((i) => i.status === "available" && i.validating);
  const comingSoon = community ? [] : INTEGRATIONS.filter((i) => i.status === "coming_soon");

  const renderCard = (it: (typeof INTEGRATIONS)[number]) => {
    const conn = byProvider.get(it.id);
    const connected = (conn?.count ?? 0) > 0;
    const available = it.status === "available";
    return (
      <Card key={it.id} accent={it.accent} className="flex flex-col">
        <div className="flex items-center gap-2.5">
          <BrandMark id={it.id} name={it.name} accent={it.accent} />
          <span className="text-[15px] font-semibold text-[var(--text)]">{it.name}</span>
          {it.validating && (
            <span className="rounded bg-[#f59e0b14] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#f59e0b]">
              Validating
            </span>
          )}
          <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-[var(--faint)]">
            {it.category}
          </span>
        </div>

        <p className="mt-2.5 text-[12.5px] leading-relaxed text-[var(--muted)]">{it.blurb}</p>

        <div className="mt-3 text-[11.5px] text-[var(--muted)]">
          <span className="font-semibold text-[var(--text)]">Powers:</span> {it.powers.join(" · ")}
        </div>
        <div className="mt-1 text-[11px] text-[var(--faint)]">{it.reads}</div>

        <div className="mt-4 flex items-center gap-2">
          {available ? (
            <>
              {connected ? (
                <span className="rounded bg-[#22c55e14] px-2 py-1 text-[11px] font-bold text-[#22c55e]">
                  ● Connected{conn?.label ? ` · ${conn.label}` : ""}
                </span>
              ) : (
                <span className="rounded bg-[var(--panel)] px-2 py-1 text-[11px] font-semibold text-[var(--faint)]">
                  Not connected
                </span>
              )}
              <Link
                href={it.href ?? "#"}
                className="ml-auto rounded-md bg-[#3b82f6] px-3.5 py-1.5 text-[12px] font-semibold text-white"
              >
                {connected ? "Manage" : "Set up →"}
              </Link>
            </>
          ) : isDemo ? (
            // Roadmap connectors are connectable on demo orgs for testing; customers see "Coming soon".
            <>
              {connected ? (
                <span className="rounded bg-[#22c55e14] px-2 py-1 text-[11px] font-bold text-[#22c55e]">● Connected{conn?.label ? ` · ${conn.label}` : ""}</span>
              ) : (
                <span className="rounded bg-[#f59e0b14] px-2 py-1 text-[11px] font-bold text-[#f59e0b]">Roadmap · demo</span>
              )}
              <Link
                href={`/dashboard/integrations/${it.id}`}
                className="ml-auto rounded-md bg-[#3b82f6] px-3.5 py-1.5 text-[12px] font-semibold text-white"
              >
                {connected ? "Manage" : "Set up →"}
              </Link>
            </>
          ) : (
            <span className="ml-auto rounded bg-[var(--panel)] px-2.5 py-1 text-[11px] font-semibold text-[var(--faint)]">
              Coming soon
            </span>
          )}
        </div>
      </Card>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div data-tour="integrations">
        <h2 className="text-xl font-bold">Managed by {BRAND.name}</h2>
        <p className="mt-1 max-w-2xl text-[13px] text-[var(--faint)]">
          Connectors {BRAND.name} builds and maintains for the common systems. Connect one once for your organization and
          every use case reuses it. {BRAND.name} reads your systems to verify control evidence — it never writes to them.
          {isDemo && <> No connector for your system? Use the <Link href="/dashboard/integrations/composer" className="text-[var(--accent,#06d6d6)] hover:underline">Integration Composer</Link>.</>}
        </p>
      </div>

      <div>
        <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[var(--faint)]">
          Available now <span className="text-[#22c55e]">· {availableNow.length} live</span>
        </h3>
        <div className="grid gap-3.5 md:grid-cols-2">{availableNow.map(renderCard)}</div>
      </div>

      {validating.length > 0 && (
        <div>
          <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[var(--faint)]">
            Validating <span className="text-[#f59e0b]">· {validating.length}</span>
          </h3>
          <div className="grid gap-3.5 md:grid-cols-2">{validating.map(renderCard)}</div>
          <p className="mt-3 max-w-2xl text-[12px] leading-relaxed text-[var(--faint)]">
            Built and ready — we&apos;re verifying these against a live tenant. Run one of these? Connect it and
            you&apos;ve validated it for everyone.
          </p>
        </div>
      )}

      {comingSoon.length > 0 && (
        <div>
          <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[var(--faint)]">
            Coming soon <span className="text-[var(--faint)]">· {comingSoon.length}</span>
          </h3>
          <div className="grid gap-3.5 md:grid-cols-2">{comingSoon.map(renderCard)}</div>
        </div>
      )}

    </div>
  );
}
