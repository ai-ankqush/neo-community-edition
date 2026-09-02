"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { OrgSwitcher } from "@/ce/auth-ui";
import { BRAND } from "@/lib/brand";
import {
  LayoutDashboard, Boxes, Layers, LayoutGrid, ShieldCheck, Gavel, Crosshair,
  Rocket, Building2, Network, ShieldHalf, Radar, RotateCcw,
  ClipboardList, Waypoints, Lightbulb, Ghost,
  LifeBuoy, Settings, ChevronDown, ChevronsLeft, ChevronsRight, ArrowLeft,
  type LucideIcon,
} from "lucide-react";
import { settingsSections, SETTINGS_DEFAULT, isSettingsRoute, sectionOn, activeSubKey } from "@/app/dashboard/settings/settings-nav";

type Item = { href: string; label: string; Icon: LucideIcon };

// Parked under "AI Assessments" — the per-use-case assessment workflow.
// Controls is the operational hood: Evidence + Assurance now live inside it as
// sub-views (see the Controls page sub-nav), so they're no longer top-level here.
const UC_CHILDREN: Item[] = [
  { href: "/dashboard/use-cases", label: "AI Use Cases", Icon: Boxes },
  { href: "/dashboard/heatmap", label: "Risk Heatmap", Icon: LayoutGrid },
  { href: "/dashboard/controls", label: "Controls", Icon: ShieldCheck },
  { href: "/dashboard/decision", label: "Decision", Icon: Gavel },
  { href: "/dashboard/red-team", label: "Red Team", Icon: Crosshair },
  { href: "/dashboard/implementation", label: "Build & Deploy", Icon: Rocket },
];

// Parked under "AI Action Fabric" — the operational surfaces only.
// Rules & authority (Govern) and Learning & tuning (Adapt) moved to
// Settings › AI Action Fabric; Observe folds into the Findings home.
const AF_CHILDREN: Item[] = [
  { href: "/dashboard/action-control/delegation", label: "Delegation", Icon: Gavel },
  { href: "/dashboard/action-control/anticipate", label: "Anticipate", Icon: Radar },
  { href: "/dashboard/action-control/recovery", label: "Recovery", Icon: RotateCcw },
];

export default function Sidebar({
  isDemo, isAdmin = false, showIntegrations, showSupplyChain, showVendor, canMultiWorkspace, curated = false, afConfigured = false, showActionFabric = false, afBeta = false, showModelProvider = false, community = false,
}: {
  isDemo: boolean; isAdmin?: boolean; showIntegrations: boolean; showSupplyChain: boolean; showVendor: boolean; canMultiWorkspace: boolean;
  curated?: boolean; afConfigured?: boolean; showActionFabric?: boolean; afBeta?: boolean; showModelProvider?: boolean; community?: boolean;
}) {
  const pathname = usePathname();
  // Focused "Admin panel": inside Settings (and the admin surfaces relocated under it —
  // Integrations, Disagreements, Track Record), the full product nav gives way to a calm
  // rail with just a way back + the settings sections.
  const focused = isSettingsRoute(pathname);
  const searchParams = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);
  const [ucOpen, setUcOpen] = useState(true);
  const [afOpen, setAfOpen] = useState(true);
  const [cgOpen, setCgOpen] = useState(true);

  useEffect(() => {
    try {
      // Curated mode keeps the nav quiet — collapsed to the icon rail by default,
      // still one click to expand. It never writes to the shared collapse pref, so
      // Advanced keeps whatever the user set there.
      if (curated) setCollapsed(true);
      else setCollapsed(localStorage.getItem("neo.nav.collapsed") === "1");
      const u = localStorage.getItem("neo.nav.ucOpen");
      if (u !== null) setUcOpen(u === "1");
      const a = localStorage.getItem("neo.nav.afOpen");
      if (a !== null) setAfOpen(a === "1");
      const g = localStorage.getItem("neo.nav.cgOpen");
      if (g !== null) setCgOpen(g === "1");
    } catch { /* ignore */ }
  }, [curated]);
  // In curated mode toggling is session-only (don't pollute the Advanced pref).
  const toggleCollapsed = () => setCollapsed((v) => { const n = !v; if (!curated) { try { localStorage.setItem("neo.nav.collapsed", n ? "1" : "0"); } catch {} } return n; });
  const toggleUc = () => setUcOpen((v) => { const n = !v; try { localStorage.setItem("neo.nav.ucOpen", n ? "1" : "0"); } catch {} return n; });
  const toggleAf = () => setAfOpen((v) => { const n = !v; try { localStorage.setItem("neo.nav.afOpen", n ? "1" : "0"); } catch {} return n; });
  const toggleCg = () => setCgOpen((v) => { const n = !v; try { localStorage.setItem("neo.nav.cgOpen", n ? "1" : "0"); } catch {} return n; });

  const isActive = (href: string) => (href === "/dashboard" ? pathname === "/dashboard" : pathname === href || pathname.startsWith(href + "/"));
  // Controls hood absorbs Evidence + Assurance + Frameworks — keep the group lit on any of them.
  const controlsHoodActive = ["/dashboard/controls", "/dashboard/evidence", "/dashboard/assurance"].some((h) => isActive(h));
  const ucActive = isActive("/dashboard/use-cases") || UC_CHILDREN.some((c) => isActive(c.href)) || controlsHoodActive;
  const afActive = pathname.startsWith("/dashboard/action-control");
  // Anticipate and Disrupt own their own subpaths; the section's activity/findings
  // now live in the Control Graph › Findings home.
  const afChildActive = (href: string) => pathname.startsWith(href);
  const scActive = pathname.startsWith("/dashboard/supply-chain") || pathname.startsWith("/dashboard/vendor-reviews");
  const cgActive = pathname.startsWith("/dashboard/control-graph");
  // One graph group now — the estate map + its per-use-case dependency zoom + vendor + insights.
  const graphGroupActive = cgActive || scActive;
  const cgChildActive = (href: string) => {
    if (href.includes("/insights")) return pathname.startsWith("/dashboard/control-graph/insights");
    if (href.includes("/shadow-ai")) return pathname.startsWith("/dashboard/control-graph/shadow-ai");
    return cgActive && !pathname.startsWith("/dashboard/control-graph/insights") && !pathname.startsWith("/dashboard/control-graph/shadow-ai");
  };

  // Vendor Review now lives inside the AI Supply Chain hood (see the group below).
  // Disagreements + Neo's Track Record moved under Settings (admin/governance surfaces).
  // Executive Summary removed; Reports renamed Executive Reports (its contents get reworked next).
  const postAF: Item[] = [
    { href: "/dashboard/reports", label: "Executive Reports", Icon: ClipboardList },
  ];
  // Integrations is a group (Managed by Neo + Composer); both available on every plan.
  const footer: Item[] = [
    { href: "/dashboard/help", label: "Help & Support", Icon: LifeBuoy },
    { href: "/dashboard/settings", label: "Settings", Icon: Settings },
  ];

  const Row = ({ item, indent, active: activeOverride, badge }: { item: Item; indent?: boolean; active?: boolean; badge?: string }) => {
    const active = activeOverride ?? isActive(item.href);
    const I = item.Icon;
    return (
      <Link href={item.href} title={collapsed ? item.label : undefined}
        className={`flex items-center gap-3 border-l-2 py-2.5 ${collapsed ? "justify-center px-0" : indent ? "pl-9 pr-4" : "px-4"} ${active ? "border-[#3b82f6] bg-[var(--border)] text-[var(--text)]" : "border-transparent text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--text)]"}`}>
        <I size={17} className="shrink-0" />
        {!collapsed && <span className="truncate text-[13px]">{item.label}</span>}
        {!collapsed && badge && <span className="ml-auto shrink-0 rounded bg-[#f59e0b1f] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#f59e0b]">{badge}</span>}
      </Link>
    );
  };

  return (
    <aside className={`hidden shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-elevated)] py-4 transition-[width] duration-150 md:flex ${focused ? "w-[248px]" : collapsed ? "w-[64px]" : "w-60"}`}>
      <div className={`flex items-center gap-2.5 pb-4 ${collapsed ? "justify-center px-0" : "px-5"}`}>
        <Link href="/dashboard" title="Go to Dashboard" aria-label="Go to Dashboard" className="flex min-w-0 items-center gap-2.5 hover:opacity-80">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={BRAND.logoUrl} alt={BRAND.name} className="h-8 w-8 shrink-0 object-contain" />
          {!collapsed && (
            <span className="text-sm font-bold leading-tight tracking-tight">
              {BRAND.name}
              {isDemo && <span className="ml-1.5 rounded bg-[#3b82f61a] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#3b82f6]">Demo</span>}
              {BRAND.tagline && <><br /><span className="text-[10px] font-medium text-[var(--muted)]">{BRAND.tagline}</span></>}
            </span>
          )}
        </Link>
        {!collapsed && (
          <button onClick={toggleCollapsed} title="Collapse menu" aria-label="Collapse menu" className="ml-auto text-[var(--muted)] hover:text-[var(--text)]"><ChevronsLeft size={18} /></button>
        )}
      </div>
      {collapsed && (
        <button onClick={toggleCollapsed} title="Expand menu" aria-label="Expand menu" className="mb-2 flex justify-center py-1 text-[var(--muted)] hover:text-[var(--text)]"><ChevronsRight size={18} /></button>
      )}

      {focused && (() => {
        const curTab = searchParams.get("tab") ?? SETTINGS_DEFAULT;
        const curSub = searchParams.get("sub") ?? "";
        const sections = settingsSections({ showAF: showActionFabric, showIntegrations: showIntegrations && isAdmin, showJudgement: isDemo && isAdmin, showModelProvider });
        return (
          <nav className="flex flex-col">
            <Link href="/dashboard"
              className="mx-3 mb-3 inline-flex items-center gap-2 rounded-md px-2.5 py-2 text-[12.5px] font-medium text-[var(--muted)] transition-colors hover:bg-[var(--border)] hover:text-[var(--text)]">
              <ArrowLeft size={15} className="shrink-0" /> Back to Dashboard
            </Link>
            <div className="mx-3 mb-2 border-t border-[var(--border)]" />
            <p className="px-4 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#4b5563]">Settings</p>
            {sections.map((s) => {
              const on = sectionOn(s, pathname, curTab);
              const subKey = on ? activeSubKey(s, pathname, curSub) : undefined;
              const I = s.Icon;
              return (
                <div key={s.key}>
                  <Link href={s.href}
                    className={`mx-2 flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-colors ${on ? "bg-[var(--border)] font-semibold text-[var(--text)]" : "text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--text)]"}`}>
                    <I size={16} className="shrink-0" style={on ? { color: "#3b82f6" } : undefined} />
                    <span className="truncate">{s.label}</span>
                  </Link>
                  {on && s.sub && (
                    <div className="mb-1 ml-[26px] mt-0.5 flex flex-col border-l border-[var(--border)] pl-2">
                      {s.sub.map((sub) => (
                        <Link key={sub.key} href={sub.href}
                          className={`rounded-md px-2.5 py-1.5 text-[12.5px] transition-colors ${sub.key === subKey ? "font-semibold text-[#3b82f6]" : "text-[var(--muted)] hover:text-[var(--text)]"}`}>
                          {sub.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        );
      })()}

      {!focused && (
      <nav className="flex flex-col">
        <Row item={{ href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard }} />

        {/* AI Assessments — the source of every use case + tech stack, so it leads.
            group header (toggles); children navigate */}
        {!collapsed && (
          <button onClick={toggleUc} title={ucOpen ? "Collapse section" : "Expand section"} aria-label="Toggle AI Assessments"
            className={`flex w-full items-center gap-3 border-l-2 px-4 py-2.5 text-left ${ucActive ? "border-[#3b82f6] text-[var(--text)]" : "border-transparent text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--text)]"}`}>
            <Layers size={17} className="shrink-0" />
            <span className="truncate text-[13px] font-semibold">AI Assessments</span>
            <ChevronDown size={16} className={`ml-auto shrink-0 transition-transform ${ucOpen ? "" : "-rotate-90"}`} />
          </button>
        )}
        {(collapsed || ucOpen) && UC_CHILDREN.map((c) => <Row key={c.href} item={c} indent={!collapsed} />)}

        {/* AI Control Graph — ONE graph: the estate map + its per-use-case dependency zoom
            (Supply Chain merged in), plus vendor review, findings and shadow AI. */}
        {(
          <>
            {!collapsed && (
              <button onClick={toggleCg} title={cgOpen ? "Collapse section" : "Expand section"} aria-label="Toggle AI Control Graph"
                className={`flex w-full items-center gap-3 border-l-2 px-4 py-2.5 text-left ${graphGroupActive ? "border-[#3b82f6] text-[var(--text)]" : "border-transparent text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--text)]"}`}>
                <Waypoints size={17} className="shrink-0" />
                <span className="truncate text-[13px] font-semibold">AI Control Graph</span>
                <ChevronDown size={16} className={`ml-auto shrink-0 transition-transform ${cgOpen ? "" : "-rotate-90"}`} />
              </button>
            )}
            {(collapsed || cgOpen) && (
              <>
                <Row item={{ href: "/dashboard/control-graph", label: "Estate map", Icon: LayoutGrid }} indent={!collapsed} active={cgChildActive("/dashboard/control-graph")} />
                {showSupplyChain && <Row item={{ href: "/dashboard/supply-chain", label: "AI Supply Chain", Icon: Network }} indent={!collapsed} active={pathname.startsWith("/dashboard/supply-chain")} />}
                {showVendor && <Row item={{ href: "/dashboard/vendor-reviews", label: "AI Vendor Review", Icon: Building2 }} indent={!collapsed} active={isActive("/dashboard/vendor-reviews")} />}
                <Row item={{ href: "/dashboard/control-graph/insights", label: "Findings", Icon: Lightbulb }} indent={!collapsed} active={cgChildActive("/dashboard/control-graph/insights")} />
                {!community && <Row item={{ href: "/dashboard/control-graph/shadow-ai", label: "Shadow AI", Icon: Ghost }} indent={!collapsed} active={cgChildActive("/dashboard/control-graph/shadow-ai")} />}
              </>
            )}
          </>
        )}

        {/* AI Action Fabric — until the decision point is enabled, it's a single
            entry that leads to the guided setup; the five functions appear only
            once setup is complete. */}
        {showActionFabric && !afConfigured && (
          <Row item={{ href: "/dashboard/action-control", label: "AI Action Fabric", Icon: ShieldHalf }} active={afActive} />
        )}
        {showActionFabric && afConfigured && (
          <>
            {!collapsed && (
              <button onClick={toggleAf} title={afOpen ? "Collapse section" : "Expand section"} aria-label="Toggle AI Action Fabric"
                className={`flex w-full items-center gap-3 border-l-2 px-4 py-2.5 text-left ${afActive ? "border-[#3b82f6] text-[var(--text)]" : "border-transparent text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--text)]"}`}>
                <ShieldHalf size={17} className="shrink-0" />
                <span className="truncate text-[13px] font-semibold">AI Action Fabric</span>
                <ChevronDown size={16} className={`ml-auto shrink-0 transition-transform ${afOpen ? "" : "-rotate-90"}`} />
              </button>
            )}
            {(collapsed || afOpen) && AF_CHILDREN.map((c) => <Row key={c.href} item={c} indent={!collapsed} active={afChildActive(c.href)} />)}
          </>
        )}

        {/* Integrations moved under Settings (admin/config surface). */}

        {postAF.map((it) => <Row key={it.href} item={it} />)}

        <div className="my-2 border-t border-[var(--border)]" />
        {footer.map((it) => <Row key={it.href} item={it} />)}
      </nav>
      )}

      {!focused && !collapsed && (
        <div className="mt-auto space-y-2 border-t border-[var(--border)] px-4 pt-4">
          <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-[#4b5563]">Organization</p>
          <OrgSwitcher
            hidePersonal
            createOrganizationMode="navigation"
            createOrganizationUrl="/dashboard/new-organization"
            afterCreateOrganizationUrl="/dashboard"
            afterSelectOrganizationUrl="/dashboard"
            appearance={{ elements: { organizationSwitcherTrigger: "w-full justify-between rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-[var(--text)] hover:bg-[var(--panel-hover)]" } }}
          />
          {canMultiWorkspace && (
            <Link href="/dashboard/new-organization" className="flex items-center gap-1.5 rounded-md px-3 py-2 text-[12.5px] font-medium text-[#3b82f6] hover:bg-[var(--border)]">
              <span className="text-[15px] leading-none">＋</span> New organization
            </Link>
          )}
          <p className="px-1 pt-1 text-[10px] leading-relaxed text-[#4b5563]">
            Each client is an isolated workspace.<br />© {BRAND.name} Control Private Limited · methodology proprietary
          </p>
        </div>
      )}
    </aside>
  );
}
