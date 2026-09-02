"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { settingsSections, SETTINGS_DEFAULT, sectionOn, activeSubKey, type NavFlags } from "./settings-nav";

/** Mobile-only settings nav — the left column is hidden on small screens, so the
 *  sections (and the active section's sub-pages) scroll horizontally up top. */
export default function SettingsMobileNav({ flags }: { flags: NavFlags }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const tab = params.get("tab") ?? SETTINGS_DEFAULT;
  const sub = params.get("sub") ?? "";
  const sections = settingsSections(flags);
  const active = sections.find((s) => sectionOn(s, pathname, tab)) ?? sections[0];
  const subKey = activeSubKey(active, pathname, sub);

  const pill = (on: boolean) =>
    `shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
      on
        ? "border-[#3b82f6] bg-[#3b82f61a] text-[var(--text)]"
        : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
    }`;

  return (
    <div className="mb-5 flex flex-col gap-2 md:hidden">
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--muted)] hover:text-[var(--text)]">
        ← Back to Dashboard
      </Link>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {sections.map((s) => (
          <Link key={s.key} href={s.href} className={pill(active.key === s.key)}>{s.label}</Link>
        ))}
      </div>
      {active.sub && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {active.sub.map((x) => (
            <Link key={x.key} href={x.href} className={pill(x.key === subKey)}>{x.label}</Link>
          ))}
        </div>
      )}
    </div>
  );
}
