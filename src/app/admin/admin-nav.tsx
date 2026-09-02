"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DollarSign, ArrowLeft } from "lucide-react";
import { BRAND } from "@/lib/brand";
export default function AdminNav() {
  const path = usePathname();
  const active = path.startsWith("/admin/finops") || path === "/admin";
  return (
    <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--panel)] p-3">
      <div className="flex items-center gap-2 px-2 py-2">
        <span className="text-[14px] font-black tracking-[0.18em] text-[var(--text)]">{BRAND.name.toUpperCase()}</span>
        <span className="rounded-full border border-[#ef444440] bg-[#ef44441a] px-1.5 py-0.5 text-[9px] font-bold text-[#ef4444]">ADMIN</span>
      </div>
      <nav className="mt-3 flex flex-col gap-0.5">
        <Link href="/admin/finops" className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition ${active ? "bg-[var(--panel-hover)] text-[var(--text)]" : "text-[var(--muted)] hover:bg-[var(--panel-hover)] hover:text-[var(--text)]"}`}>
          <DollarSign size={15} className={active ? "text-[#3b82f6]" : ""} /> FinOps
        </Link>
      </nav>
      <div className="mt-auto border-t border-[var(--border)] pt-2">
        <Link href="/dashboard" className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-[var(--muted)] hover:bg-[var(--panel-hover)] hover:text-[var(--text)]">
          <ArrowLeft size={15} /> Back to app
        </Link>
      </div>
    </aside>
  );
}
