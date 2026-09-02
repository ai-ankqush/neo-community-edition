"use client";

import { useRouter } from "next/navigation";

export default function UcFilter({
  useCases,
  current,
}: {
  useCases: { id: string; name: string }[];
  current: string;
}) {
  const router = useRouter();
  return (
    <select
      value={current}
      onChange={(e) =>
        router.push(e.target.value ? `/dashboard/executive?uc=${e.target.value}` : "/dashboard/executive")
      }
      className="ml-auto rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[12.5px] text-[var(--text)] outline-none focus:border-[#3b82f6]"
    >
      <option value="">All use cases</option>
      {useCases.map((u) => (
        <option key={u.id} value={u.id}>{u.name}</option>
      ))}
    </select>
  );
}
