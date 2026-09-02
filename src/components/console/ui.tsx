import Link from "next/link";
import { TIER_COLORS, TIER_NAMES, REC_DISPLAY, STATUS_COLORS, STATUS_LABELS } from "./theme";

/** Console UI primitives - ported from the Layer 1 console design. */

/** Small "i" pointer that explains a term on hover (CSS bubble — reliable, instant).
 *  Pair it with Ask Neo for the full answer. */
export function Info({ text }: { text: string }) {
  return (
    <span className="group relative ml-1 inline-flex items-center align-middle">
      <span aria-label={text}
        className="inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-[var(--border)] text-[9px] font-bold text-[var(--muted)]">
        i
      </span>
      <span role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 w-60 max-w-[16rem] -translate-x-1/2 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-left text-[11px] font-normal leading-snug text-[var(--text)] opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
        {text}
      </span>
    </span>
  );
}

export function Card({
  children,
  className = "",
  accent,
  dataTour,
}: {
  children: React.ReactNode;
  className?: string;
  accent?: string;
  dataTour?: string; // optional anchor for the guided product tour
}) {
  return (
    <div
      data-tour={dataTour}
      className={`rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-5 ${className}`}
      style={accent ? { borderLeft: `3px solid ${accent}` } : undefined}
    >
      {children}
    </div>
  );
}

export function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-[var(--muted)]">
      {children}
    </div>
  );
}

export function KPICard({
  label,
  value,
  color = "var(--text)",
  sub,
  href,
}: {
  label: string;
  value: string | number;
  color?: string;
  sub?: string;
  href?: string;
}) {
  const inner = (
    <>
      <div className="mb-1 flex items-center justify-between text-xs uppercase tracking-wider text-[var(--muted)]">
        {label}
        {href && <span className="text-[#4b5563] transition group-hover:text-[#3b82f6]">→</span>}
      </div>
      <div className="text-[28px] font-bold" style={{ color }}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-[var(--faint)]">{sub}</div>}
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className="group block rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-5 transition hover:border-[#3b82f660]"
      >
        {inner}
      </Link>
    );
  }
  return <Card>{inner}</Card>;
}

export function TierBadge({ tier }: { tier: number }) {
  const c = TIER_COLORS[tier] ?? "var(--faint)";
  return (
    <span
      className="inline-block whitespace-nowrap rounded px-2.5 py-0.5 text-[11px] font-bold"
      style={{ color: c, background: `${c}1f`, border: `1px solid ${c}40` }}
      title={TIER_NAMES[tier]}
    >
      TIER {tier}
    </span>
  );
}

export const FUNCTION_COLORS: Record<string, string> = {
  "IT": "#3b82f6",
  "Security": "#ef4444",
  "Legal": "#8b5cf6",
  "HR": "#d946ef",
  "Finance": "#0ea5e9",
  "Marketing": "#ec4899",
  "Sales": "#f59e0b",
  "Support": "#06b6d4",
  "Customer Relations": "#14b8a6",
  "Operations": "#22c55e",
  "Company-wide": "#64748b",
  "Other": "#6b7280",
};

export function FunctionBadge({ fn }: { fn: string }) {
  const c = FUNCTION_COLORS[fn] ?? "#6b7280";
  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold"
      style={{ color: c, background: `${c}1f`, border: `1px solid ${c}55` }}
    >
      {fn}
    </span>
  );
}

export function RecBadge({ rec }: { rec: string }) {
  const d = REC_DISPLAY[rec] ?? { label: rec.replaceAll("_", " "), color: "var(--faint)" };
  return (
    <span
      className="inline-block whitespace-nowrap rounded px-2.5 py-0.5 text-[11px] font-semibold"
      style={{ color: d.color, background: `${d.color}1f`, border: `1px solid ${d.color}40` }}
    >
      {d.label}
    </span>
  );
}

export function StatusDot({ status }: { status: string }) {
  const c = STATUS_COLORS[status] ?? "var(--faint)";
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs" style={{ color: c }}>
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: c }} />
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="border-b border-[var(--border)] px-3.5 py-2.5 text-left text-[11px] font-medium uppercase text-[var(--faint)]">
      {children}
    </th>
  );
}

export function Td({
  children,
  className = "",
  colSpan,
}: {
  children: React.ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={`border-b border-[var(--surface-2)] px-3.5 py-2.5 align-top ${className}`}>
      {children}
    </td>
  );
}
