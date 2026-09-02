"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";

export default function LogoutButton() {
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    try {
      const r = await fetch("/api/sky/auth/logout", { method: "POST" });
      const j = await r.json();
      window.location.href = j.redirect || "/login";
    } catch {
      window.location.href = "/login";
    }
  }
  return (
    <button onClick={logout} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-50">
      <LogOut size={13} /> Sign out
    </button>
  );
}
