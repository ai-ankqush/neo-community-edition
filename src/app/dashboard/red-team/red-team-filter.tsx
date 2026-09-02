"use client";

import { useRouter, useSearchParams } from "next/navigation";

export default function RedTeamFilter({ useCases }: { useCases: { id: string; name: string }[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const current = sp.get("uc") ?? "";

  function set(uc: string) {
    const params = new URLSearchParams(sp.toString());
    if (uc) params.set("uc", uc);
    else params.delete("uc");
    const qs = params.toString();
    router.push(qs ? `/dashboard/red-team?${qs}` : "/dashboard/red-team");
  }

  return (
    <select
      value={current}
      onChange={(e) => set(e.target.value)}
      className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-[13px] text-[var(--text)] outline-none focus:border-[#3b82f6]"
    >
      <option value="">All use cases</option>
      {useCases.map((u) => (
        <option key={u.id} value={u.id}>{u.name}</option>
      ))}
    </select>
  );
}
