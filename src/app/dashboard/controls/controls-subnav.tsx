"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Controls is the operational hood — Coverage, Evidence, Assurance and Frameworks
 *  are views of the same controls, so they share one sub-nav instead of four
 *  separate top-level items. */
const TABS = [
  { href: "/dashboard/controls", label: "Coverage" },
  { href: "/dashboard/evidence", label: "Evidence" },
  { href: "/dashboard/assurance", label: "Assurance" },
];

export default function ControlsSubnav() {
  const pathname = usePathname();
  const isOn = (href: string) =>
    href === "/dashboard/controls"
      ? pathname === "/dashboard/controls"
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--faint)]">Controls</div>
      <div className="flex flex-wrap gap-1 border-b border-[var(--border)]">
        {TABS.map((t) => {
          const on = isOn(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`-mb-px border-b-2 px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                on
                  ? "border-[#3b82f6] text-[var(--text)]"
                  : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
