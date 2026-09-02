"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export interface SettingsTab {
  key: string;
  label: string;
  node: React.ReactNode;
}

/** Settings, grouped into tabs so admin config stops piling onto one long scroll.
 *  Deep-linkable via ?tab=<key> (used by the graduation nudge → AI Action Fabric).
 *  Panels are server-rendered and passed in as nodes; only the active one mounts. */
export default function SettingsTabs({ tabs }: { tabs: SettingsTab[] }) {
  const sp = useSearchParams();
  const wanted = sp.get("tab");
  const initial = tabs.some((t) => t.key === wanted) ? (wanted as string) : tabs[0]?.key;
  const [active, setActive] = useState(initial);

  // Keep state in sync if the query param changes (e.g. a deep link fires while mounted).
  useEffect(() => {
    if (wanted && tabs.some((t) => t.key === wanted)) setActive(wanted);
  }, [wanted, tabs]);

  function select(key: string) {
    setActive(key);
    // Reflect the tab in the URL without a server round-trip.
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", key);
      window.history.replaceState(null, "", url.toString());
    } catch { /* ignore */ }
  }

  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-1 border-b border-[var(--border)]">
        {tabs.map((t) => {
          const on = t.key === current?.key;
          return (
            <button
              key={t.key}
              onClick={() => select(t.key)}
              className={`-mb-px border-b-2 px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                on
                  ? "border-[#3b82f6] text-[var(--text)]"
                  : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div>{current?.node}</div>
    </div>
  );
}
