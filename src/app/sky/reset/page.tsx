"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import AuthShell from "../_authshell";

export default function SkyResetPage() {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token"));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords don't match."); return; }
    if (!token) { setError("This reset link is missing its token."); return; }
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/sky/auth/password/reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not reset the password.");
      window.location.href = j.signedIn ? "/" : "/login";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset the password.");
      setBusy(false);
    }
  }

  return (
    <AuthShell heading="Set a new password" subtitle="Choose a new password for your Neo Sky account.">
      <form onSubmit={submit} className="space-y-3.5">
        <Field label="New password" value={password} onChange={setPassword} placeholder="At least 10 characters" autoFocus />
        <Field label="Confirm password" value={confirm} onChange={setConfirm} placeholder="Re-enter password" />
        {error && <div className="rounded-xl border border-[#EFCFCB] bg-[#FBEEEC] px-3.5 py-2.5 text-[12px] text-[var(--bad)]">{error}</div>}
        <button type="submit" disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-[13.5px] font-semibold text-white shadow-[0_4px_14px_rgba(93,83,224,0.24)] transition hover:brightness-110 disabled:opacity-50">
          {busy && <Loader2 size={14} className="animate-spin" />} Set new password
        </button>
      </form>
      <p className="mt-5 text-[12.5px] text-[var(--muted)]"><a href="/login" className="font-semibold text-[var(--brand)] hover:underline">← Back to sign in</a></p>
    </AuthShell>
  );
}

function Field({ label, value, onChange, placeholder, autoFocus }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11.5px] font-medium text-[var(--muted)]">{label}</span>
      <input type="password" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} required autoFocus={autoFocus}
        className="w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3.5 py-2.5 text-[13.5px] text-[var(--text)] outline-none transition placeholder:text-[var(--faint)] focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15" />
    </label>
  );
}
