"use client";

/** Curated ⇄ Advanced toggle. Sets the neo_mode cookie (read server-side by the
 *  dashboard) and reloads so the right home renders. Curated = the plated estate
 *  view; Advanced = the full dashboard, unchanged. Demo accounts only for now. */

function setMode(mode: "curated" | "advanced") {
  // 1-year cookie, site-wide
  document.cookie = `neo_mode=${mode}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  window.location.reload();
}

export default function ModeToggle({ current }: { current: "curated" | "advanced" }) {
  return (
    <span className="inline-flex overflow-hidden rounded-full border border-[var(--border)] text-[12px]">
      <button
        onClick={() => current !== "curated" && setMode("curated")}
        className={
          current === "curated"
            ? "bg-[#06d6d6] px-3 py-1 font-semibold text-[#06212a]"
            : "px-3 py-1 text-[var(--muted)] hover:text-[var(--text)]"
        }
        aria-pressed={current === "curated"}
      >
        Curated
      </button>
      <button
        onClick={() => current !== "advanced" && setMode("advanced")}
        className={
          current === "advanced"
            ? "bg-[#3b82f6] px-3 py-1 font-semibold text-white"
            : "px-3 py-1 text-[var(--muted)] hover:text-[var(--text)]"
        }
        aria-pressed={current === "advanced"}
      >
        Advanced
      </button>
    </span>
  );
}
