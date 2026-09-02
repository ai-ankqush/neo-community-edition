"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

/** Portfolio-page filter: narrow a rollup to a single use case via ?uc=<id>. */
export default function UseCaseFilter({ useCases }: { useCases: { id: string; name: string }[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const pathname = usePathname();
  const current = sp.get("uc") ?? "";

  function set(uc: string) {
    const p = new URLSearchParams(sp.toString());
    if (uc) p.set("uc", uc);
    else p.delete("uc");
    const q = p.toString();
    router.push(q ? `${pathname}?${q}` : pathname);
  }

  if (useCases.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--faint)]">Use case</span>
      <select
        value={current}
        onChange={(e) => set(e.target.value)}
        className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1.5 text-[12.5px] text-[var(--text)] outline-none focus:border-[#3b82f6]"
      >
        <option value="">All use cases</option>
        {useCases.map((u) => (
          <option key={u.id} value={u.id}>{u.name}</option>
        ))}
      </select>
    </div>
  );
}
