"use client";

import { useState } from "react";
import { Loader2, MailCheck } from "lucide-react";
import AuthShell from "../_authshell";

// Honour a same-origin ?next= after signup (Community Edition lands on /dashboard). Defaults to "/".
function nextDest(): string {
  if (typeof window === "undefined") return "/";
  const n = new URLSearchParams(window.location.search).get("next");
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/";
}

export default function SkySignupPage() {
  const [method, setMethod] = useState<"password" | "magic">("password");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ devUrl?: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/sky/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, displayName: displayName || undefined, orgName: orgName || undefined, method, password: method === "password" ? password : undefined }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not create the account.");
      if (j.signedIn) { window.location.href = j.firstRun ? "/sky/setup" : nextDest(); return; }
      setSent({ devUrl: j.devUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the account.");
    } finally {
      setBusy(false);
    }
  }

  if (sent)
    return (
      <AuthShell heading="Verify your email" subtitle="One click and you're in.">
        <div className="flex items-start gap-3 rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-3.5">
          <MailCheck size={18} className="mt-0.5 shrink-0 text-[var(--brand)]" />
          <div className="text-[12.5px] leading-relaxed text-[var(--muted)]">
            Check <span className="font-semibold text-[var(--text)]">{email}</span> for a link to confirm your address and finish signing in.
            {sent.devUrl && <div className="mt-2 break-all rounded-lg border border-[var(--border)] bg-[var(--panel)] p-2 text-[11px]"><div className="mb-1 font-semibold text-[#8A6A2E]">Dev mode (no email sender):</div><a className="text-[var(--brand)] underline" href={sent.devUrl}>{sent.devUrl}</a></div>}
          </div>
        </div>
        <p className="mt-5 text-[12.5px] text-[var(--muted)]"><a href="/login" className="font-semibold text-[var(--brand)] hover:underline">← Back to sign in</a></p>
      </AuthShell>
    );

  return (
    <AuthShell heading="Create your account" subtitle="Your Neo account — assess and control your AI use cases.">
      <div className="mb-4 inline-flex rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 text-[12.5px]">
        <Toggle active={method === "password"} onClick={() => setMethod("password")}>Set a password</Toggle>
        <Toggle active={method === "magic"} onClick={() => setMethod("magic")}>Email link</Toggle>
      </div>

      <form onSubmit={submit} className="space-y-3.5">
        <Field label="Work email" type="email" value={email} onChange={setEmail} placeholder="you@company.com" required autoFocus />
        <Field label="Your name" type="text" value={displayName} onChange={setDisplayName} placeholder="Optional" />
        <Field label="Organization" type="text" value={orgName} onChange={setOrgName} placeholder="Optional — defaults from your email" />
        {method === "password" && <Field label="Password" type="password" value={password} onChange={setPassword} placeholder="At least 10 characters" required />}
        {error && <div className="rounded-xl border border-[var(--bad)] bg-[var(--panel)] px-3.5 py-2.5 text-[12px] font-medium text-[var(--bad)]">{error}</div>}
        <button type="submit" disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-[13.5px] font-semibold text-white shadow-[0_4px_14px_rgba(93,83,224,0.24)] transition hover:brightness-110 disabled:opacity-50">
          {busy && <Loader2 size={14} className="animate-spin" />}{method === "password" ? "Create account" : "Email me a sign-in link"}
        </button>
      </form>

      <p className="mt-6 text-center text-[12.5px] text-[var(--muted)]">Already have an account? <a href="/login" className="font-semibold text-[var(--brand)] hover:underline">Sign in</a></p>
    </AuthShell>
  );
}

function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`rounded-lg px-3.5 py-1.5 font-medium transition ${active ? "bg-[var(--panel)] text-[var(--text)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--text)]"}`}>{children}</button>;
}
function Field({ label, type, value, onChange, placeholder, required, autoFocus }: { label: string; type: string; value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean; autoFocus?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11.5px] font-medium text-[var(--muted)]">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} required={required} autoFocus={autoFocus}
        className="w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3.5 py-2.5 text-[13.5px] text-[var(--text)] outline-none transition placeholder:text-[var(--faint)] focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15" />
    </label>
  );
}
