"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";

export default function RedeemCode({ compUntil }: { compUntil: string | null }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (compUntil && new Date(compUntil).getTime() > Date.now()) {
    const days = Math.ceil((new Date(compUntil).getTime() - Date.now()) / 86400_000);
    return (
      <div className="rounded-md border border-[#22c55e40] bg-[#22c55e0a] px-4 py-3 text-[13px] text-[var(--text)]">
        <span className="font-semibold text-[#22c55e]">Founding Reviewer access active</span> — full platform,{" "}
        {days} day{days === 1 ? "" : "s"} left. Thanks for testing {BRAND.name}; we&apos;d love your feedback at {BRAND.contactEmail}.
      </div>
    );
  }

  async function redeem() {
    if (code.trim().length < 2 || busy) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/billing/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Could not redeem");
      setMsg("Redeemed! You have 30 days of full access. Reloading…");
      setTimeout(() => router.refresh(), 900);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not redeem");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium text-[var(--text)]">Have a Founding Reviewer code?</span>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Enter code"
          className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-[13px] text-[var(--text)] outline-none focus:border-[#3b82f6]"
        />
        <button
          onClick={redeem}
          disabled={busy || code.trim().length < 2}
          className="rounded-md bg-[#3b82f6] px-4 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Redeeming…" : "Redeem"}
        </button>
      </div>
      {msg && <p className="mt-1.5 text-[12px] text-[#22c55e]">{msg}</p>}
      {err && <p className="mt-1.5 text-[12px] text-red-500">{err}</p>}
    </div>
  );
}
