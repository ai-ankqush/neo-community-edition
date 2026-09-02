"use client";

import { useState } from "react";
import Link from "next/link";
import { BRAND } from "@/lib/brand";

export default function MobileNav({
  showSupplyChain = false,
  showVendor = false,
  showControlGraph = false,
  afConfigured = false,
  showActionFabric = false,
  community = false,
}: {
  showSupplyChain?: boolean;
  showVendor?: boolean;
  showControlGraph?: boolean;
  afConfigured?: boolean;
  showActionFabric?: boolean;
  community?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const links: [string, string][] = [
    ["/dashboard", "Dashboard"],
    // AI Assessments group (header + children) — the source of every use case, so it leads
    ["#assessments", "AI Assessments"],
    ["/dashboard/use-cases", "· AI Use Cases"],
    ["/dashboard/heatmap", "· Risk Heatmap"],
    ["/dashboard/controls", "· Controls"],
    ["/dashboard/decision", "· Decision"],
    ["/dashboard/red-team", "· Red Team"],
    ["/dashboard/implementation", "· Build & Deploy"],
    // AI Control Graph — the estate map derived FROM the assessments above, so it follows
    ...(showControlGraph ? [
      ["#controlgraph", "AI Control Graph"] as [string, string],
      ["/dashboard/control-graph", "· Estate map"] as [string, string],
      ...(showSupplyChain ? [["/dashboard/supply-chain", "· AI Supply Chain"] as [string, string]] : []),
      ...(showVendor ? [["/dashboard/vendor-reviews", "· AI Vendor Review"] as [string, string]] : []),
      ["/dashboard/control-graph/insights", "· Findings"] as [string, string],
      ...(community ? [] : [["/dashboard/control-graph/shadow-ai", "· Shadow AI"] as [string, string]]),
    ] : []),
    // AI Action Fabric (Beta) — single entry until setup is complete, then the five functions.
    ...(showActionFabric && !afConfigured ? [
      ["/dashboard/action-control", "AI Action Fabric"] as [string, string],
    ] : []),
    ...(showActionFabric && afConfigured ? [
      ["#actionfabric", "AI Action Fabric"] as [string, string],
      ["/dashboard/action-control/anticipate", "· Anticipate"] as [string, string],
      ["/dashboard/action-control/recovery", "· Recovery"] as [string, string],
    ] : []),
    ["/dashboard/reports", "Executive Reports"],
    ["/dashboard/help", "Help & Support"],
    ["/dashboard/settings", "Settings"],
  ];

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text)]"
      >
        <span className="text-lg leading-none">☰</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <nav className="absolute left-0 top-0 flex h-full w-64 flex-col overflow-y-auto border-r border-[var(--border)] bg-[var(--bg-elevated)] p-3">
            <div className="mb-3 flex items-center justify-between px-2 py-1">
              <span className="text-sm font-bold text-[var(--text)]">{BRAND.name}</span>
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="text-[var(--muted)]">✕</button>
            </div>
            {links.map(([href, label]) =>
              href.startsWith("#") ? (
                <div key={href} className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--faint)]">{label}</div>
              ) : (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className="rounded-md px-3 py-2.5 text-[14px] text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--text)]"
                >
                  {label}
                </Link>
              ),
            )}
          </nav>
        </div>
      )}
    </div>
  );
}
