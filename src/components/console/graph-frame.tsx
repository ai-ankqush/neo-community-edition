"use client";

import { useState, type ReactNode } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

/** Wrap any graph + its controls. Adds a Full screen toggle that lifts the whole
 *  subtree into a fixed overlay — filters and selection stay live because the
 *  children never unmount. The child render-prop receives `fullscreen` so the
 *  graph can use the extra height. Shared across the Control Graph and the
 *  Dependency/Authority graph. */
export default function GraphFrame({ children, corner = "top-right" }: { children: (fullscreen: boolean) => ReactNode; corner?: "top-right" | "bottom-right" }) {
  const [full, setFull] = useState(false);
  // bottom-right when full (so it never sits over viewport chrome), else the chosen corner
  const pos = full ? "bottom-3 right-3" : corner === "bottom-right" ? "bottom-3 right-3" : "top-2 right-2";
  return (
    <div className={full ? "fixed inset-0 z-[80] flex flex-col gap-3 overflow-auto bg-[var(--bg)] p-4" : "relative"}>
      <button
        onClick={() => setFull((f) => !f)}
        title={full ? "Exit full screen" : "Full screen"}
        aria-label={full ? "Exit full screen" : "Full screen"}
        className={`absolute ${pos} z-10 flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--muted)] hover:text-[var(--text)]`}
      >
        {full ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        {full ? "Exit" : "Full screen"}
      </button>
      {children(full)}
    </div>
  );
}
