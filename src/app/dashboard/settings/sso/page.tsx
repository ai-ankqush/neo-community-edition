import Link from "next/link";
import { getAuthContext } from "@/server/identity/auth-context";
import { auth } from "@clerk/nextjs/server";
import { ensureOrg } from "@/lib/org";
import { supabaseAdmin } from "@/lib/supabase";
import { planFor } from "@/lib/plans";
import { Card } from "@/components/console/ui";
import SsoForm, { type SsoConfig } from "./sso-form";
import CopyField from "./copy-field";
import { BRAND } from "@/lib/brand";

export default async function SsoPage() {
  const { orgId, orgRole, userId } = await getAuthContext();
  if (!orgId) return <p className="text-[var(--muted)]">Select an organization first.</p>;
  const internalOrgId = (await getAuthContext()).internalOrgId as string;
  const sb = supabaseAdmin();

  // platform role: Clerk admin -> org_admin, else our memberships table
  let platformRole = "viewer";
  if (orgRole === "org:admin") platformRole = "org_admin";
  else if (userId) {
    const { data: m } = await sb.from("memberships").select("role").eq("org_id", internalOrgId).eq("user_id", userId).maybeSingle();
    platformRole = m?.role ?? "viewer";
  }
  const isAdmin = platformRole === "org_admin";

  const [{ data: org }, { data: config }] = await Promise.all([
    sb.from("organizations").select("plan").eq("id", internalOrgId).single(),
    sb.from("sso_configs").select("*").eq("org_id", internalOrgId).maybeSingle(),
  ]);
  const plan = planFor(org?.plan);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div data-tour="sso">
        <Link href="/dashboard/settings" className="text-[12px] text-[var(--faint)] hover:text-[#3b82f6]">← Settings</Link>
        <h2 className="mt-1 text-xl font-bold">Single Sign-On (SSO)</h2>
        <p className="mt-1 text-[13px] text-[var(--faint)]">
          Let your team sign in with your company identity provider (Okta, Entra ID, Google, or any SAML/OIDC IdP).
        </p>
      </div>

      {!plan.sso ? (
        <Card accent="#3b82f6">
          <h3 className="text-sm font-semibold text-[var(--text)]">SSO is an Enterprise feature</h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--muted)]">
            Enterprise adds SAML/OIDC single sign-on with automatic user provisioning, multiple workspaces,
            advanced reporting, expert review, and live control verification across your stack. To enable it
            for your workspace, talk to us.
          </p>
          <div className="mt-3 flex gap-2">
            <Link href="/dashboard/plans" className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)] hover:border-[#3b82f660] hover:text-[#3b82f6]">View plans</Link>
            <a href={`mailto:${BRAND.contactEmail}?subject=${BRAND.name}%20Enterprise%20SSO`} className="rounded-md bg-[#3b82f6] px-3 py-1.5 text-xs font-semibold text-white">Contact us</a>
          </div>
        </Card>
      ) : !isAdmin ? (
        <Card>
          <p className="text-[13px] text-[var(--muted)]">Only organization admins can configure SSO.</p>
        </Card>
      ) : (
        <>
          {/* status */}
          <StatusBanner status={config?.status ?? null} domains={config?.email_domains ?? null} />

          {/* SP details published by Neo — what the customer's IT puts into their IdP */}
          {(config?.acs_url || config?.sp_entity_id || config?.setup_instructions) && (
            <Card accent="#3b82f6">
              <h3 className="text-sm font-semibold text-[var(--text)]">Configure your identity provider</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]">
                Enter these values when creating the {BRAND.name} application in your IdP, then send your IdP metadata back to us.
              </p>
              <div className="mt-3 flex flex-col gap-3">
                {config?.acs_url && <CopyField label="ACS URL (Single Sign-On URL)" value={config.acs_url as string} />}
                {config?.sp_entity_id && <CopyField label="SP Entity ID (Audience)" value={config.sp_entity_id as string} />}
                {config?.setup_instructions && (
                  <div>
                    <label className="mb-1 block text-[11px] uppercase text-[var(--faint)]">Notes from {BRAND.name}</label>
                    <p className="whitespace-pre-wrap rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-[13px] leading-relaxed text-[var(--text)]">
                      {config.setup_instructions as string}
                    </p>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* how it works */}
          <Card>
            <h3 className="text-sm font-semibold text-[var(--text)]">How setup works</h3>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[13px] leading-relaxed text-[var(--muted)]">
              <li>Submit your identity provider and company email domain(s) below.</li>
              <li>We create the enterprise connection and email you the exact values your IdP needs (ACS URL and Entity ID).</li>
              <li>Your IT team adds those to your IdP and shares the IdP metadata back.</li>
              <li>We activate it. From then on, anyone with a verified email domain signs in through your IdP and is added to this workspace automatically (just-in-time provisioning).</li>
            </ol>
            <p className="mt-3 text-[12px] text-[var(--faint)]">
              Typical turnaround is one business day. Existing members keep their current sign-in until SSO is active.
            </p>
          </Card>

          <SsoForm config={(config as SsoConfig) ?? null} />
        </>
      )}
    </div>
  );
}

function StatusBanner({ status, domains }: { status: string | null; domains: string | null }) {
  if (status === "active") {
    return (
      <div className="rounded-md border border-[#22c55e40] bg-[#22c55e0a] px-4 py-3 text-[13px] text-[var(--text)]">
        <span className="font-semibold text-[#22c55e]">SSO is active</span>
        {domains && <span className="text-[var(--muted)]"> · {domains}</span>}
        <p className="mt-1 text-[12px] text-[var(--muted)]">Members from your verified domains sign in through your IdP. Update details below if anything changes.</p>
      </div>
    );
  }
  if (status === "configuring") {
    return (
      <div className="rounded-md border border-[#3b82f640] bg-[#3b82f60a] px-4 py-3 text-[13px] text-[var(--text)]">
        <span className="font-semibold text-[#3b82f6]">Your turn — configure your IdP</span>
        <p className="mt-1 text-[12px] text-[var(--muted)]">We&apos;ve set up the connection. Use the values below to create the {BRAND.name} app in your identity provider, then reply with your IdP metadata so we can activate it.</p>
      </div>
    );
  }
  if (status === "requested") {
    return (
      <div className="rounded-md border border-[#f59e0b40] bg-[#f59e0b0a] px-4 py-3 text-[13px] text-[var(--text)]">
        <span className="font-semibold text-[#f59e0b]">Setup in progress</span>
        <p className="mt-1 text-[12px] text-[var(--muted)]">We&apos;ve received your request and will share your IdP setup values here shortly. You can update the details below any time.</p>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-[13px] text-[var(--muted)]">
      SSO isn&apos;t configured yet. Submit your details below to get started.
    </div>
  );
}
