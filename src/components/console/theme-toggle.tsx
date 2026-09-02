"use client";

import { useEffect, useState } from "react";

/** Light/dark switch. The actual class is applied pre-paint by the inline
 *  script in the root layout; this just reflects + flips it and persists. */
export default function ThemeToggle() {
  const [light, setLight] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setLight(document.documentElement.classList.contains("theme-light"));
    setReady(true);
  }, []);

  function toggle() {
    const next = !light;
    setLight(next);
    document.documentElement.classList.toggle("theme-light", next);
    try {
      localStorage.setItem("neo-theme", next ? "light" : "dark");
    } catch {
      // ignore storage failures (private mode, etc.)
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label={light ? "Switch to dark mode" : "Switch to light mode"}
      title={light ? "Switch to dark mode" : "Switch to light mode"}
      className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--panel-hover)] hover:text-[var(--text)]"
    >
      {/* render a stable glyph until mounted to avoid hydration mismatch */}
      <span className="text-[15px] leading-none">{ready ? (light ? "☾" : "☀") : "☀"}</span>
    </button>
  );
}
