import Link from "next/link";
import { Suspense } from "react";
import { UserMenu, OrgSwitcher, CreateOrg } from "@/ce/auth-ui";
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import NotificationsBell from "@/components/console/notifications-bell";
import { BRAND } from "@/lib/brand";
import AskNeoLauncher from "@/components/console/ask-neo-launcher";
import SentinelWatch from "@/components/console/sentinel-watch";
import MobileNav from "@/components/console/mobile-nav";
import Sidebar from "@/components/console/sidebar";
import ThemeToggle from "@/components/console/theme-toggle";
import { recordTermsAcceptance } from "@/lib/legal";
import { loadAFSetup } from "@/server/action-control/setup";
import { ensureOrg } from "@/lib/org";
import { supabaseAdmin } from "@/lib/supabase";
import { trialState } from "@/lib/trial";
import { planFor, canActionFabric } from "@/lib/plans";
import { byokEnabled } from "@/server/model/provider";
import { canSupplyChain } from "@/lib/supply-chain-access";
import { isCommunity, EDITION_COOKIE } from "@/ce/edition";
import { getAuthContext } from "@/server/identity/auth-context";
import PlanCards from "./plans/plan-cards";
import ProductTour from "@/components/console/product-tour";
import TourButton from "@/components/console/tour-button";

// Partner lock (white-label): a locked partner deployment is suspended. The partner instance polls
// the owner's registry via /api/partners/status. Fails OPEN on any error so a transient network
// blip never locks a partner out. Only active when PARTNER_KEY is set (i.e. on a partner deploy).
async function partnerLocked(): Promise<boolean> {
  const key = process.env.PARTNER_KEY;
  if (!key) return false;
  const base = process.env.PARTNER_STATUS_URL || "https://app.neocontrol.ai";
  try {
    const r = await fetch(`${base}/api/partners/status?key=${encodeURIComponent(key)}`, { next: { revalidate: 60 } });
    if (!r.ok) return false;
    const s = await r.json();
    return Boolean(s?.locked);
  } catch {
    return false;
  }
}

function PartnerSuspendedGate() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] px-6 text-center text-[var(--text)]">
      <h1 className="mb-3 text-2xl font-bold">Service temporarily unavailable</h1>
      <p className="max-w-md text-[var(--muted)]">This workspace is currently suspended. Please contact your administrator to restore access.</p>
    </main>
  );
}

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  if (await partnerLocked()) return <PartnerSuspendedGate />;
  // Best-effort: mirror the user's legal consent (captured at Clerk sign-up)
  // into our DB on first authenticated load. Never blocks rendering.
  await recordTermsAcceptance();

  // Trial gate: an expired trial must choose a plan before continuing.
  let plan: string | null = null;
  let trialEndsAt: string | null = null;
  let isDemo = false;
  let deletedAt: string | null = null;
  let purgeAfter: string | null = null;
  let afConfigured = false; // AI Action Fabric decision point enabled → show its function nav
  let needsModelKey = false; // Community/BYO org that hasn't added its model key yet
  const { orgRole, internalOrgId } = await getAuthContext();
  // Self-signup onboarding: a signed-in user with no active organization creates their first one
  // here instead of dead-ending in a broken dashboard. (First org is always allowed.)
  if (!internalOrgId) return <CreateOrgGate />;
  const isAdmin = orgRole === "org:admin";
  if (internalOrgId) {
    const { data: org } = await supabaseAdmin()
      .from("organizations").select("plan, trial_ends_at, is_demo, last_active_at, dormancy_warned_at, deleted_at, purge_after, model_provider").eq("id", internalOrgId).single();
    plan = org?.plan ?? null;
    needsModelKey = byokEnabled() && !planFor(plan).managedModelKey && !org?.model_provider;
    trialEndsAt = (org?.trial_ends_at as string | null) ?? null;
    isDemo = Boolean(org?.is_demo);
    deletedAt = (org?.deleted_at as string | null) ?? null;
    purgeAfter = (org?.purge_after as string | null) ?? null;
    if (canActionFabric(plan, isDemo)) { try { afConfigured = (await loadAFSetup(internalOrgId)).pdpAcked; } catch { /* migration not applied yet → treat as not set up */ } }

    // mark activity (throttled to ~6h) and cancel any pending dormancy warning
    const lastActive = org?.last_active_at ? new Date(org.last_active_at as string).getTime() : 0;
    if (!deletedAt && (org?.dormancy_warned_at || Date.now() - lastActive > 6 * 60 * 60 * 1000)) {
      await supabaseAdmin()
        .from("organizations")
        .update({ last_active_at: new Date().toISOString(), dormancy_warned_at: null, confirm_token: null })
        .eq("id", internalOrgId);
    }
  }
  // Deletion hold: org is locked out of the app but recoverable by an admin.
  if (deletedAt) return <DeletedGate purgeAfter={purgeAfter} />;
  // New org, no plan chosen yet → force the plan picker before anything else.
  if (!isDemo && (!plan || plan === "unselected")) {
    return (
      <main className="min-h-screen bg-[var(--bg)] px-4 py-10 text-[var(--text)]">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold text-[var(--text)]">Choose how to start</h1>
            <p className="mt-1.5 text-[13.5px] text-[var(--muted)]">Pick a plan to begin. You can change it anytime in Settings.</p>
          </div>
          <PlanCards currentPlan="unselected" requestedPlan={null} onboarding />
        </div>
      </main>
    );
  }
  const trial = trialState(plan, trialEndsAt);
  if (!isDemo && trial.expired) return <TrialEndedGate plan={plan ?? "trial"} />;
  const canMultiWorkspace = planFor(plan).multiWorkspace;
  const showIntegrations = planFor(plan).integrations || isDemo;
  const showSupplyChain = canSupplyChain(plan, isDemo);
  const showActionFabric = canActionFabric(plan, isDemo); // Beta: decision-point/shadow half
  const afBeta = showActionFabric && !isDemo;             // show "Beta" tag for non-demo cohort

  // Community Edition: same console, five paid modules hidden. Active for a
  // deployment-wide community build (NEO_EDITION) OR a per-viewer preview cookie
  // set at /neo-ce-gated. No flag + no cookie = full product (production default).
  const cookieCommunity = (await cookies()).get(EDITION_COOKIE)?.value === "community";
  const community = isCommunity() || cookieCommunity;

  // Curated mode (all orgs, default on) quiets the sidebar to the icon rail.
  const navMode = (await cookies()).get("neo_mode")?.value === "advanced" ? "advanced" : "curated";
  const curatedNav = navMode === "curated";

  return (
    <div className="flex min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <Sidebar
        isDemo={isDemo}
        isAdmin={isAdmin}
        showIntegrations={showIntegrations}
        showSupplyChain={community ? false : showSupplyChain}
        showVendor={community ? false : (planFor(plan).vendorReview || isDemo)}
        canMultiWorkspace={canMultiWorkspace}
        curated={curatedNav}
        afConfigured={afConfigured}
        showActionFabric={community ? false : showActionFabric}
        afBeta={afBeta}
        showModelProvider={community ? true : !planFor(plan).managedModelKey}
        community={community}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 md:px-8">
          <MobileNav showSupplyChain={community ? false : showSupplyChain} showVendor={community ? false : (planFor(plan).vendorReview || isDemo)} showControlGraph afConfigured={afConfigured} showActionFabric={community ? false : showActionFabric} community={community} />
          <div className="ml-auto flex items-center gap-3">
            {cookieCommunity && (
              <a href="/neo-ce-gated/exit" className="rounded-md border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-[var(--muted)] hover:text-[var(--text)]" title="Return to the full product">
                Community Edition preview · Exit
              </a>
            )}
            <TourButton />
            <ThemeToggle />
            <NotificationsBell />
            <UserMenu />
            {/* Plain link, not a Clerk component — stays usable even if Clerk's browser SDK fails to load. */}
            <a href="/sign-out" className="text-[12px] font-medium text-[var(--muted)] hover:text-[var(--text)]">Sign out</a>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-8">
          {needsModelKey && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#f59e0b55] bg-[#f59e0b1a] px-4 py-2.5 text-[13px] text-[var(--text)]">
              <span>Add your model provider key to start running assessments — Community runs on your own key.</span>
              <Link href="/dashboard/settings?tab=model-provider" className="font-semibold text-[#f59e0b]">Add your key →</Link>
            </div>
          )}
          {trial.onTrial && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#3b82f640] bg-[#3b82f61a] px-4 py-2 text-[13px] text-[var(--text)]">
              <span>Free trial — {trial.daysLeft} day{trial.daysLeft === 1 ? "" : "s"} left, full features.</span>
              <Link href="/dashboard/plans" className="font-semibold text-[#3b82f6]">Choose a plan →</Link>
            </div>
          )}
          {children}
        </main>
      </div>
      <AskNeoLauncher />
      {isDemo && <SentinelWatch />}
      <Suspense fallback={null}><ProductTour /></Suspense>
    </div>
  );
}

function CreateOrgGate() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] px-6 py-12 text-[var(--text)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={BRAND.logoUrl} alt={BRAND.name} className="mb-4 h-10 w-10 object-contain" />
      <h1 className="mb-1 text-xl font-bold">Create your organization</h1>
      <p className="mb-6 max-w-md text-center text-[13px] leading-relaxed text-[var(--muted)]">
        Set up your workspace to start onboarding your AI use cases. You can invite your team once it&apos;s created.
      </p>
      <CreateOrg afterCreateOrganizationUrl="/dashboard" skipInvitationScreen />
      <a href="/sign-out" className="mt-6 text-[12px] font-medium text-[var(--muted)] hover:text-[var(--text)]">Sign out</a>
    </div>
  );
}

function TrialEndedGate({ plan }: { plan: string }) {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-3">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={BRAND.logoUrl} alt={BRAND.name} className="h-8 w-8 object-contain" />
          <span className="text-sm font-bold">{BRAND.name}</span>
        </div>
        <div className="flex items-center gap-3">
          <OrgSwitcher hidePersonal afterSelectOrganizationUrl="/dashboard" />
          <UserMenu />
          {/* Plain link, not a Clerk component — stays usable even if Clerk's browser SDK fails to load. */}
          <a href="/sign-out" className="text-[12px] font-medium text-[var(--muted)] hover:text-[var(--text)]">Sign out</a>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-2xl font-bold">Your free trial has ended</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-[var(--muted)]">
          Thanks for trying {BRAND.name}. Choose a plan to keep your assessments, controls, evidence, and decisions —
          you&apos;ll pick up exactly where you left off. Managing multiple workspaces? Switch workspaces above.
        </p>
        <div className="mt-8">
          <PlanCards currentPlan={plan} requestedPlan={null} />
        </div>
        <p className="mt-6 text-[12px] text-[var(--faint)]">
          Questions? Email <a href={`mailto:${BRAND.contactEmail}`} className="text-[#3b82f6]">{BRAND.contactEmail}</a>.
        </p>
      </div>
    </div>
  );
}

function DeletedGate({ purgeAfter }: { purgeAfter: string | null }) {
  const when = purgeAfter
    ? new Date(purgeAfter).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-3">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={BRAND.logoUrl} alt={BRAND.name} className="h-8 w-8 object-contain" />
          <span className="text-sm font-bold">{BRAND.name}</span>
        </div>
        <div className="flex items-center gap-3">
          <OrgSwitcher hidePersonal afterSelectOrganizationUrl="/dashboard" />
          <UserMenu />
          {/* Plain link, not a Clerk component — stays usable even if Clerk's browser SDK fails to load. */}
          <a href="/sign-out" className="text-[12px] font-medium text-[var(--muted)] hover:text-[var(--text)]">Sign out</a>
        </div>
      </header>
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-bold">This organization has been deleted</h1>
        <p className="mt-2 leading-relaxed text-[var(--muted)]">
          Access is paused while it&apos;s in a recovery hold.{" "}
          {when
            ? <>If it isn&apos;t restored, it and all its data will be permanently removed on <span className="font-semibold text-[var(--text)]">{when}</span>.</>
            : <>It is scheduled for permanent removal.</>}{" "}
          If this was a mistake, contact us and we can restore it before then. If you have other organizations,
          switch to one above.
        </p>
        <p className="mt-6 text-[12px] text-[var(--faint)]">
          Email <a href={`mailto:${BRAND.contactEmail}`} className="text-[#3b82f6]">{BRAND.contactEmail}</a> to restore this organization.
        </p>
      </div>
    </div>
  );
}


export const dynamic = "force-dynamic";
