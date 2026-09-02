import { Waypoints, Boxes, Crosshair, Zap, CreditCard } from "lucide-react";
import { BRAND } from "@/lib/brand";

/** What's new — a lightweight in-app changelog so logged-in users see what shipped.
 *  Static + curated (newest first). Update the RELEASES array when you ship. */

type Release = {
  date: string;
  title: string;
  Icon: typeof Waypoints;
  color: string;
  items: string[];
};

const RELEASES: Release[] = [
  {
    date: "June 2026",
    title: "AI Control Graph — now on every plan",
    Icon: Waypoints,
    color: "#0d9488",
    items: [
      "Your whole AI estate in one map — every use case and the data, models, systems, controls, and decisions around it.",
      "Control Picture: a plain-English verdict per use case (what it touches, what it can do, what could go wrong, what proves it's controlled).",
      "Findings: a priority-sorted feed split into operational and governance lanes, each with what to do.",
      "What stands out: estate-level insights (concentration, shared blast radius, posture, ownership) right on the map.",
    ],
  },
  {
    date: "June 2026",
    title: "Simpler pricing — every feature on every plan",
    Icon: CreditCard,
    color: "#3b82f6",
    items: [
      "All AI analysis features are now on every plan — Assessments, AI Control Graph, Supply Chain + AI-BOM, Red Team, vendor risk, integrations, and code generation.",
      "Plans differ by how many active AI use cases you govern, not by which features you get.",
      "Enterprise adds SSO, multiple workspaces, advanced reporting, and live verification.",
    ],
  },
  {
    date: "June 2026",
    title: "AI Supply Chain — deeper coverage",
    Icon: Boxes,
    color: "#8b5cf6",
    items: [
      "Framework-layer CVEs surfaced against your AI dependencies.",
      "CycloneDX AI-CBOM export for due diligence and audits.",
      "The full dependency ledger persists on every snapshot.",
    ],
  },
  {
    date: "June 2026",
    title: "Red Team v2 — grounded attack paths",
    Icon: Crosshair,
    color: "#ef4444",
    items: [
      "Attack paths are instantiated on your real authority graph, not generic scenarios.",
      "A path is only marked 'blocked' when the breaking control is actually verified.",
    ],
  },
  {
    date: "Private preview",
    title: "AI Action Fabric",
    Icon: Zap,
    color: "#d97706",
    items: [
      "Real-time mediation of what your AI is allowed to do — shadow-first, with a kill switch.",
      "In private preview; reach out if you'd like early access.",
    ],
  },
];

export default function WhatsNewPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-bold">What's new</h1>
      <p className="mt-1 mb-6 text-[13px] text-[var(--muted)]">The latest in {BRAND.name} — newest first.</p>

      <div className="flex flex-col gap-4">
        {RELEASES.map((r, i) => (
          <div key={i} className="rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: `${r.color}1f`, color: r.color }}>
                <r.Icon size={18} />
              </span>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--faint)]">{r.date}</div>
                <div className="text-[15px] font-bold text-[var(--text)]">{r.title}</div>
              </div>
            </div>
            <ul className="mt-3 flex flex-col gap-1.5 pl-1">
              {r.items.map((it, j) => (
                <li key={j} className="flex gap-2 text-[13px] leading-relaxed text-[var(--muted)]">
                  <span style={{ color: r.color }}>•</span>{it}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
