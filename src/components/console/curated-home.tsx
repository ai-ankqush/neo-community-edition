import { BRAND } from "@/lib/brand";
/** CuratedHome — the locked Simple-mode estate home (see memory: simple-home-main-page).
 *  Server-rendered and presentational; the toggle and Ask Neo bar are the only
 *  client pieces. One surface, read top-down: estate verdict → decisions →
 *  build → worth knowing. No role titles, no colored blocks — left-edge accents
 *  and dots only. Uses the console theme variables so light/dark both work. */

import Link from "next/link";
import ModeToggle from "./mode-toggle";
import type { CuratedHomeModel, CuratedRow, KnowingRow } from "@/lib/curated-home";

const TEAL = "#06d6d6";

function Group({ label, color, children }: { label: string; color: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <div className="mb-2 text-[11px] uppercase tracking-[0.07em] text-[var(--faint)]">{label}</div>
      <div
        className="flex flex-col divide-y divide-[var(--border)] rounded-[10px] border border-[var(--border)] bg-[var(--surface)]"
        style={{ borderLeft: `3px solid ${color}` }}
      >
        {children}
      </div>
    </div>
  );
}

function Row({ dot, line, action, href }: { dot: string; line: string; action: string; href: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-3 text-[14px] hover:bg-[var(--border)]">
      <span className="h-[7px] w-[7px] flex-none rounded-full" style={{ background: dot }} />
      <span className="text-[var(--text)]">{line}</span>
      <span className="ml-auto flex-none text-[13px] font-medium" style={{ color: TEAL }}>{action} →</span>
    </Link>
  );
}

function Tile({ href, value, icon, iconColor, label, selected }: {
  href: string; value: string; icon: string; iconColor: string; label: string; selected?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-[12px] border bg-[var(--surface)] px-3 py-4 text-center transition-colors hover:border-[var(--faint)] ${
        selected ? "border-[#06d6d6]" : "border-[var(--border)]"
      }`}
    >
      <div className="flex items-center justify-center gap-1.5">
        <span className="text-[26px] font-semibold leading-none text-[var(--text)]">{value}</span>
        <span className="text-[15px]" style={{ color: iconColor }}>{icon}</span>
      </div>
      <div className="mt-1.5 text-[12px] text-[var(--muted)]">{label}</div>
    </Link>
  );
}

export default function CuratedHome({ model, orgName }: { model: CuratedHomeModel; orgName: string }) {
  const { total, ready, activeTasks, modelProviders, dataSources, decisions, build, inProgress, knowing } = model;

  if (total === 0) {
    return (
      <div className="flex flex-col gap-4">
        <Header />
        <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-6">
          <div className="text-[20px] font-semibold text-[var(--text)]">Let&apos;s set up your first AI use case.</div>
          <p className="mt-2 text-[14px] text-[var(--muted)]">
            Describe what the AI does, and {BRAND.name} shows you what it can see, do, and where it could go wrong —
            then how to prove it&apos;s controlled.
          </p>
          <Link href="/dashboard/use-cases/new" className="mt-4 inline-block rounded-[10px] bg-[#06d6d6] px-4 py-2.5 text-[13px] font-semibold text-[#06212a]">
            Describe your AI →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <Header />

      {/* glance tiles — counts tie out to the groups below */}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile href="/dashboard/use-cases" value={String(ready)} icon="✓" iconColor="#22c55e" label="Use Cases Ready" />
        <Tile href="#tasks" value={String(activeTasks)} icon="≡" iconColor="#f59e0b" label="Active Tasks" selected />
        <Tile href="/dashboard/control-graph" value={String(modelProviders)} icon="▦" iconColor="#7c93f0" label="Model Providers" />
        <Tile href="/dashboard/supply-chain" value={String(dataSources)} icon="▤" iconColor="#3b82f6" label="Connected Data" />
      </div>

      <div id="tasks" />

      {decisions.length > 0 && (
        <Group label="Needs a decision" color="#f59e0b">
          {decisions.slice(0, 4).map((r: CuratedRow) => <Row key={r.id} dot="#f59e0b" line={r.line} action={r.action} href={r.href} />)}
        </Group>
      )}

      {build.length > 0 && (
        <Group label="Ready to build" color="#22c55e">
          {build.slice(0, 5).map((r: CuratedRow) => <Row key={r.id} dot="#22c55e" line={r.line} action={r.action} href={r.href} />)}
        </Group>
      )}

      {knowing.length > 0 && (
        <Group label="Worth knowing" color="#3b82f6">
          {knowing.map((r: KnowingRow) => <Row key={r.key} dot="#3b82f6" line={r.text} action="See map" href={r.href} />)}
        </Group>
      )}

      {inProgress.length > 0 && (
        <Group label="Still being set up" color="#7c93f0">
          {inProgress.slice(0, 4).map((r: CuratedRow) => <Row key={r.id} dot="#7c93f0" line={r.line} action={r.action} href={r.href} />)}
        </Group>
      )}

      {/* keeps a small estate from feeling lonely, and is a natural next step on any estate */}
      <Link
        href="/dashboard/use-cases/new"
        className="mt-5 flex items-center gap-2.5 rounded-[10px] border border-dashed border-[var(--border)] px-4 py-3 text-[14px] text-[var(--muted)] hover:border-[var(--faint)] hover:text-[var(--text)]"
      >
        <span className="text-[16px] leading-none" style={{ color: TEAL }}>＋</span>
        Describe another AI use case
        {total <= 2 && <span className="text-[13px] text-[var(--faint)]">— add a few more to see patterns across your estate</span>}
        <span className="ml-auto text-[13px] font-medium" style={{ color: TEAL }}>Start →</span>
      </Link>

      <div className="mt-5 text-[11px] text-[var(--faint)]">
        Curated view of {orgName} — {total} use case{total === 1 ? "" : "s"}. Switch to Advanced for the full estate map, graphs, Red Team and reports.
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="flex items-center gap-3">
      <h2 className="text-[18px] font-semibold text-[var(--text)]">Your AI estate</h2>
      <span className="ml-auto"><ModeToggle current="curated" /></span>
    </div>
  );
}
