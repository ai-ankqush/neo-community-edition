"use client";

import { useRouter } from "next/navigation";

/** Jump straight to another use case without going back to the portfolio list. */
export default function UseCaseSwitcher({ current, list }: { current: string; list: { id: string; name: string }[] }) {
  const router = useRouter();
  if (list.length <= 1) return null;
  return (
    <select
      value={current}
      onChange={(e) => router.push(`/dashboard/use-cases/${e.target.value}`)}
      title="Switch use case"
      className="max-w-[240px] truncate rounded-md border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1.5 text-[12.5px] text-[var(--text)] outline-none focus:border-[#3b82f6]"
    >
      {list.map((u) => (
        <option key={u.id} value={u.id}>{u.name}</option>
      ))}
    </select>
  );
}
