import { auth } from "@clerk/nextjs/server";
import { getAuthContext } from "@/server/identity/auth-context";
import { ensureOrg } from "@/lib/org";
import { supabaseAdmin } from "@/lib/supabase";
import { Card, CardLabel, KPICard } from "@/components/console/ui";
import MembersTable from "./members-table";
import InviteForm from "./invite-form";
import AuditLog from "./audit-log";
import RiskToleranceEditor from "./risk-tolerance-editor";
import ModelProviderPanel from "./model-provider-panel";
import { communityActive } from "@/ce/server";
import { settingsSections, activeSubKey } from "./settings-nav";
import SettingsMobileNav from "./settings-mobile-nav";
import FrameworksView from "../controls/frameworks/frameworks-view";
import { loadFrameworks } from "@/server/frameworks/custom";
import { KNOWN_FRAMEWORKS } from "@/server/frameworks/catalogues";
import { PILLAR_NAMES } from "@/components/console/theme";
import { normalizeTargets } from "@/lib/risk-tolerance";

import { planFor, canActionFabric, canEnforce } from "@/lib/plans";
import { trialState } from "@/lib/trial";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; sub?: string }>;
}) {
  const sp = await searchParams;
  const { orgId, orgRole } = await getAuthContext();
  if (!orgId) return <p className="text-[var(--muted)]">Select an organization first.</p>;
  const isAdmin = orgRole === "org:admin";
  const internalOrgId = (await getAuthContext()).internalOrgId as string;
  const sb = supabaseAdmin();

  const [{ data: org }, { count: activeUseCases }] = await Promise.all([
    sb.from("organizations")
      .select("name, plan, trial_ends_at, current_period_end, billing_cadence, risk_tolerance, is_demo, model_provider")
      .eq("id", internalOrgId).single(),
    sb.from("use_cases")
      .select("id", { count: "exact", head: true })
      .eq("org_id", internalOrgId).neq("status", "archived"),
  ]);

  const isDemo = Boolean(org?.is_demo);
  const showActionFabric = canActionFabric((org?.plan as string | null) ?? null, isDemo);
  const plan = planFor(org?.plan);
  const ucLimit = Number.isFinite(plan.useCasesActive) ? String(plan.useCasesActive) : "Unlimited";

  // price box
  const cadence = (org?.billing_cadence as string | null) ?? "monthly";
  const price =
    plan.priceMonthly === 0 ? "Free"
    : plan.priceMonthly == null ? "Custom"
    : cadence === "annual" ? `$${(plan.priceMonthly * 10).toLocaleString()}/yr`
    : `$${plan.priceMonthly.toLocaleString()}/mo`;

  // status box: trial days left / renewal date / active
  const trial = trialState(org?.plan ?? null, (org?.trial_ends_at as string | null) ?? null);
  const periodEnd = org?.current_period_end ? new Date(org.current_period_end as string).toLocaleDateString() : null;
  let box4Label = "Status";
  let box4Value = "Active";
  let box4Color = "#22c55e";
  if (trial.onTrial) { box4Label = "Trial"; box4Value = `${trial.daysLeft} day${trial.daysLeft === 1 ? "" : "s"} left`; box4Color = "#3b82f6"; }
  else if (periodEnd) { box4Label = "Renews"; box4Value = periodEnd; box4Color = "#8892a4"; }

  const organizationPanel = (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-[var(--muted)]">
          Plan & Usage
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
          <KPICard label="Current Plan" value={plan.label} color="#3b82f6" />
          <KPICard label="Use Cases" value={`${activeUseCases ?? 0} / ${ucLimit}`} color="#22c55e"
            sub="active under governance" />
          <KPICard label="Price" value={price} sub={plan.priceMonthly && plan.priceMonthly > 0 ? `billed ${cadence}` : ""} />
          <KPICard label={box4Label} value={box4Value} color={box4Color} />
        </div>
        <Card className="mt-3.5" accent="#3b82f6">
          <CardLabel>Billing</CardLabel>
          <p className="text-sm leading-relaxed text-[var(--muted)]">
            Manage your subscription, payment method, and invoices from the billing portal on the{" "}
            <a href="/dashboard/plans" className="text-[#3b82f6]">Plans</a> page. For Enterprise or any
            billing question, contact <span className="text-[#3b82f6]">{BRAND.contactEmail}</span>.
          </p>
        </Card>
      </div>
    </div>
  );

  const assessmentsPanel = (
    <div className="flex flex-col gap-6">
      {/* risk appetite — per-tier acceptable control coverage; the coverage bars colour against it */}
      <div>
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-[var(--muted)]">
          Risk appetite
        </h3>
        <Card accent="#16a34a">
          <CardLabel>Acceptable control coverage by risk tier</CardLabel>
          <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
            Set how much control coverage your business will accept for each risk tier. The coverage bars across your
            dashboards colour against these — a use case turns green once it meets the target for its tier. Higher-risk
            tiers should demand more, and a Tier&nbsp;4–5 use case with an outright control gap won&apos;t go green even
            if the percentage clears.
          </p>
          <div className="mt-3">
            <RiskToleranceEditor initial={normalizeTargets(org?.risk_tolerance)} canEdit={isAdmin} />
          </div>
        </Card>
      </div>
    </div>
  );

  const teamPanel = (
    <div className="flex flex-col gap-6">
      {/* platform roles - ours, audit-logged (Clerk's paid add-on avoided) */}
      <div>
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-[var(--muted)]">
          Platform Roles
        </h3>
        <Card dataTour="admin-panel" className="overflow-x-auto p-0">
          <MembersTable />
        </Card>
        <p className="mt-2 text-xs text-[var(--faint)]">
          Organization admins (set in the panel below) always have full access. Other members
          default to Viewer until assigned a role here. Role changes are audit-logged.
        </p>

        {/* what each role can do */}
        <Card className="mt-3">
          <CardLabel>What each role can do</CardLabel>
          <div className="mt-2 flex flex-col divide-y divide-[var(--border)]">
            {[
              { name: "Admin", color: "#22c55e", can: "Full control — manage members, billing, and roles; run assessments; record the final board and vendor decisions; delete use cases and vendor reviews." },
              { name: "Auditor / Assessor", color: "#3b82f6", can: "Runs the assessment — create use cases and vendor reviews, run the engine, accept generated drafts, verify controls, invite vendors, edit context and answers.", cant: "Can't manage members/billing or record the final decision." },
              { name: "Contributor", color: "#f59e0b", can: "Helps with the work — answer questions, complete tasks, and upload evidence.", cant: "Can't run the engine, verify controls, or decide." },
              { name: "Viewer", color: "#6b7280", can: "Read-only — view everything and export reports/PDFs.", cant: "Makes no changes." },
            ].map((r) => (
              <div key={r.name} className="flex gap-3 py-2.5">
                <span className="mt-0.5 w-[130px] shrink-0 text-[12.5px] font-semibold" style={{ color: r.color }}>{r.name}</span>
                <div className="text-[12.5px] leading-relaxed text-[var(--muted)]">
                  {r.can}{r.cant && <span className="text-[var(--faint)]"> {r.cant}</span>}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-[var(--faint)]">Roles are cumulative: each level can do everything the one below it can.</p>
        </Card>
      </div>

      {/* invite teammates - our own flow with platform roles */}
      {isAdmin && (
        <div>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-[var(--muted)]">
            Invite a teammate
          </h3>
          <InviteForm />
          <p className="mt-2 text-xs text-[var(--faint)]">
            They&apos;ll get an email invite and join with the role you choose. Manage roles or remove
            members from the table above.
          </p>
        </div>
      )}

      {/* single sign-on - admin-only; gated to Enterprise on the SSO page itself */}
      {isAdmin && (
        <div>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-[var(--muted)]">
            Single Sign-On
          </h3>
          <Card className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[13px] text-[var(--muted)]">
              Let your team sign in with your company identity provider (Okta, Entra ID, Google, SAML/OIDC).
              Available on Enterprise.
            </p>
            <a
              href="/dashboard/settings/sso"
              className="shrink-0 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)] hover:border-[#3b82f660] hover:text-[#3b82f6]"
            >
              Configure SSO →
            </a>
          </Card>
        </div>
      )}

      {/* activity log - admin-only, last 30 days */}
      {isAdmin && (
        <div>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-[var(--muted)]">
            Activity Log
          </h3>
          <Card className="overflow-hidden p-0">
            <AuditLog />
          </Card>
          <p className="mt-2 text-xs text-[var(--faint)]">
            Who did what, over the last 30 days — assessments run, code generated, packs downloaded,
            role changes. Append-only; entries can&apos;t be edited or deleted.
          </p>
        </div>
      )}
    </div>
  );

  const generalPanel = (
    <div className="flex flex-col gap-8">
      <section>
        <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">Workspace</h3>
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[16px] font-semibold text-[var(--text)]">{org?.name}</div>
              <div className="mt-0.5 text-[12.5px] text-[var(--muted)]">Isolated workspace · methodology proprietary</div>
            </div>
            <span className="rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1 text-[12px] font-semibold text-[var(--muted)]">
              {plan.label} plan
            </span>
          </div>
        </Card>
      </section>
      <section>
        <h3 className="mb-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">Personal</h3>
        <p className="mb-3 text-[12.5px] leading-relaxed text-[var(--faint)]">
          What {BRAND.name} remembers about you — private to your account, never visible to your admins.
        </p>
      </section>
      {isDemo && isAdmin && (
        <section>
          <h3 className="mb-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">{BRAND.name} agent <span className="text-[#06d6d6]">preview</span></h3>
          <p className="mb-3 text-[12.5px] leading-relaxed text-[var(--faint)]">
            A per-org token so the {BRAND.name} agent (the orb) can drive this platform over its API. Demo only.
          </p>
        </section>
      )}
    </div>
  );

  // The left column (sidebar, focused mode) owns navigation; the page renders one in-page section.
  // Community Edition always runs BYO key, so the model-provider panel is always available there.
  const community = await communityActive();
  const navFlags = {
    showAF: showActionFabric,
    showIntegrations: (planFor(org?.plan).integrations || isDemo) && isAdmin,
    showJudgement: isDemo && isAdmin,
    showModelProvider: community || !plan.managedModelKey, // Community/BYO orgs configure their own key
  };
  const sections = settingsSections(navFlags).filter((s) => s.inPage);
  const active = sections.find((s) => s.key === sp.tab) ?? sections[0];
  const activeSub = active.sub ? activeSubKey(active, "/dashboard/settings", sp.sub ?? "") : undefined;
  const subMeta = active.sub?.find((x) => x.key === activeSub);

  // Frameworks manager lives under AI Assessments → Frameworks (admin defines; everyone views).
  let frameworksPanel: import("react").ReactNode = null;
  if (active.key === "assessments" && activeSub === "frameworks") {
    const { frameworks, mappings } = await loadFrameworks(internalOrgId);
    const pillars = Object.entries(PILLAR_NAMES).map(([n, name]) => ({ pillar: Number(n), name }));
    frameworksPanel = <FrameworksView frameworks={frameworks} mappings={mappings} pillars={pillars} known={KNOWN_FRAMEWORKS} canCreate={isAdmin} />;
  }

  const panel = (() => {
    switch (active.key) {
      case "general": return generalPanel;
      case "billing": return organizationPanel;
      case "team": return teamPanel;
      case "assessments": return activeSub === "frameworks" ? frameworksPanel : assessmentsPanel;
      case "model-provider":
        return <ModelProviderPanel initial={{ provider: (org?.model_provider as string | null) ?? null, configured: Boolean(org?.model_provider), managed: community ? false : plan.managedModelKey }} canEdit={isAdmin} orgId={internalOrgId} neoAwsAccountId={process.env.NEO_AWS_ACCOUNT_ID ?? ""} />;
      default: return generalPanel;
    }
  })();

  return (
    <div className="mx-auto w-full max-w-4xl">
      <SettingsMobileNav flags={navFlags} />
      <header className="mb-7 border-b border-[var(--border)] pb-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#3b82f6]">
          {subMeta ? active.label : "Settings"}
        </div>
        <h1 className="mt-1 text-[24px] font-bold tracking-tight text-[var(--text)]">
          {subMeta ? subMeta.label : active.label}
        </h1>
        <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-[var(--muted)]">
          {subMeta ? subMeta.blurb : active.blurb}
        </p>
      </header>
      {panel}
    </div>
  );
}
