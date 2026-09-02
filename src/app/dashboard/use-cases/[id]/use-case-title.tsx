"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";

/** The use case name doubles as the switcher — click it to jump to another use case. */
export default function UseCaseTitle({
  current, name, list,
}: { current: string; name: string; list: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const canSwitch = list.length > 1;

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (!canSwitch) return <h1 className="text-xl font-bold">{name}</h1>;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Switch use case"
        className="flex items-center gap-1.5 text-xl font-bold text-[var(--text)] hover:opacity-80"
      >
        {name}
        <ChevronDown size={18} className="text-[var(--muted)]" />
      </button>
      {open && (
        <div className="absolute left-0 top-9 z-30 min-w-[240px] rounded-md border border-[var(--border)] bg-[var(--panel)] p-1 shadow-lg">
          <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--faint)]">Switch use case</div>
          {list.map((u) => (
            <button
              key={u.id}
              onClick={() => { setOpen(false); if (u.id !== current) { router.push(`/dashboard/use-cases/${u.id}`); router.refresh(); } }}
              className={`block w-full truncate rounded px-3 py-1.5 text-left text-[13px] ${u.id === current ? "bg-[var(--border)] text-[var(--text)]" : "text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--text)]"}`}
            >
              {u.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
