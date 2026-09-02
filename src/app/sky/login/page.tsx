"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mail, KeyRound, Building2, ArrowRight, Fingerprint, MailCheck } from "lucide-react";
import AuthShell from "../_authshell";
import { loginWithPasskey, passkeysSupported } from "../_passkey";
import { CLERK_ACTIVE } from "@/ce/auth-ui";

type Sso = { displayName: string; startUrl: string };

const ERRORS: Record<string, string> = {
  invalid_link: "That sign-in link was invalid.",
  expired_link: "That link has expired or was already used. Request a new one.",
  no_org: "No workspace is attached to that account.",
  sso_not_configured: "SSO isn't set up for that domain.",
  sso_denied: "SSO sign-in was cancelled or denied.",
  sso_failed: "SSO sign-in couldn't be completed. Please try again.",
  sso_no_domain: "No domain was provided for SSO.",
};

// After sign-in, honour a same-origin ?next= (e.g. Community Edition lands on /dashboard).
// Defaults to "/", so Sky's own flow is unchanged.
function nextDest(): string {
  if (typeof window === "undefined") return "/";
  const n = new URLSearchParams(window.location.search).get("next");
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/";
}

export default function SkyLoginPage() {
  const [view, setView] = useState<"signin" | "forgot" | "mfa">("signin");
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sent, setSent] = useState<{ devUrl?: string } | null>(null);
  const [sso, setSso] = useState<Sso | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get("error");
    if (e && ERRORS[e]) setError(ERRORS[e]);
  }, []);

  // Fresh self-hosted install with no accounts yet → send the first user to sign-up (they become admin).
  useEffect(() => {
    if (CLERK_ACTIVE) return; // hosted Sky always has users
    fetch("/api/sky/auth/bootstrap-status")
      .then((r) => r.json())
      .then((j) => {
        if (j && j.hasUsers === false) {
          const next = new URLSearchParams(window.location.search).get("next");
          window.location.replace("/signup" + (next ? `?next=${encodeURIComponent(next)}` : ""));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const domain = email.split("@")[1];
    if (!domain || !domain.includes(".")) { setSso(null); return; }
    debounce.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/sky/auth/idp-lookup?email=${encodeURIComponent(email)}`);
        const j = await r.json();
        setSso(j.configured ? { displayName: j.displayName, startUrl: j.startUrl } : null);
      } catch { setSso(null); }
    }, 400);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [email]);

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setNotice(null);
    try {
      const r = await fetch("/api/sky/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
      const j = await r.json();
      if (r.status === 403 && j.needsVerification) { setNotice(j.error); setBusy(false); return; }
      if (j.mfaRequired) { setView("mfa"); setBusy(false); return; }
      if (!r.ok) throw new Error(j.error || "Could not sign in.");
      window.location.href = nextDest();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
      setBusy(false);
    }
  }

  async function submitEmailOnly(e: React.FormEvent, endpoint: string) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Request failed.");
      setSent({ devUrl: j.devUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  if (sent)
    return (
      <AuthShell heading="Check your email" subtitle="A secure link is on its way.">
        <div className="flex items-start gap-3 rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-3.5">
          <MailCheck size={18} className="mt-0.5 shrink-0 text-[var(--brand)]" />
          <div className="text-[12.5px] leading-relaxed text-[var(--muted)]">
            If an account exists for <span className="font-semibold text-[var(--text)]">{email}</span>, a link is on its way. It expires in 15 minutes.
            {sent.devUrl && <DevLink url={sent.devUrl} />}
          </div>
        </div>
        <BackLink onClick={() => { setSent(null); setView("signin"); }} />
      </AuthShell>
    );

  if (view === "mfa") return <MfaStep onBack={() => { setView("signin"); setError(null); }} />;

  if (view === "forgot")
    return (
      <AuthShell heading="Reset your password" subtitle="We'll email you a secure link to set a new one.">
        <form onSubmit={(e) => submitEmailOnly(e, "/api/sky/auth/password/forgot")} className="space-y-3.5">
          <EmailField value={email} onChange={setEmail} />
          {error && <ErrorBox>{error}</ErrorBox>}
          <Submit busy={busy}>Send reset link</Submit>
        </form>
        <BackLink onClick={() => { setView("signin"); setError(null); }} />
      </AuthShell>
    );

  return (
    <AuthShell heading="Sign in" subtitle="Welcome back to Neo.">
      {sso && (
        <a href={sso.startUrl} className="group mb-4 flex items-center justify-between rounded-2xl border border-[var(--brand)]/40 bg-gradient-to-r from-[var(--surface)] to-[var(--panel)] px-4 py-3 text-[13px] font-semibold text-[var(--brand)] transition hover:border-[var(--brand)]">
          <span className="flex items-center gap-2.5"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--brand)]/10"><Building2 size={15} /></span><span>Continue with SSO<span className="block text-[10.5px] font-medium text-[var(--faint)]">{sso.displayName} · {email.split("@")[1]}</span></span></span>
          <ArrowRight size={16} className="transition group-hover:translate-x-0.5" />
        </a>
      )}

      <div className="mb-4 inline-flex rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 text-[12.5px]">
        <Toggle active={mode === "password"} onClick={() => setMode("password")}><KeyRound size={13} /> Password</Toggle>
        <Toggle active={mode === "magic"} onClick={() => setMode("magic")}><Mail size={13} /> Email link</Toggle>
      </div>

      {notice && <div className="mb-3 rounded-xl border border-[var(--warn)] bg-[var(--panel)] px-3.5 py-2.5 text-[12px] font-medium text-[var(--warn)]">{notice}</div>}

      <form onSubmit={mode === "password" ? submitPassword : (e) => submitEmailOnly(e, "/api/sky/auth/magic/request")} className="space-y-3.5">
        <EmailField value={email} onChange={setEmail} />
        {mode === "password" && (
          <div>
            <PasswordField value={password} onChange={setPassword} />
            <button type="button" onClick={() => { setView("forgot"); setError(null); }} className="mt-1.5 text-[11.5px] font-medium text-[var(--brand)] hover:underline">Forgot your password?</button>
          </div>
        )}
        {error && <ErrorBox>{error}</ErrorBox>}
        <Submit busy={busy}>{mode === "password" ? "Sign in" : "Email me a sign-in link"}</Submit>
      </form>

      <PasskeyButton email={email} onError={setError} />

      <p className="mt-6 text-center text-[12.5px] text-[var(--muted)]">New here? <a href="/signup" className="font-semibold text-[var(--brand)] hover:underline">Create an account</a></p>
    </AuthShell>
  );
}

/** Second factor. The password already verified; no session exists until this passes. */
function MfaStep({ onBack }: { onBack: () => void }) {
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/sky/auth/mfa/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, recovery }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not verify the code.");
      window.location.href = nextDest();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify the code.");
      setBusy(false);
    }
  }

  return (
    <AuthShell heading="Two-factor authentication" subtitle={recovery ? "Enter one of your recovery codes." : "Enter the 6-digit code from your authenticator app."}>
      <form onSubmit={submit} className="space-y-3.5">
        <Labeled label={recovery ? "Recovery code" : "Authentication code"}>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={recovery ? "XXXXX-XXXXX" : "123456"} required autoFocus
            inputMode={recovery ? "text" : "numeric"} autoComplete="one-time-code"
            className={`${inputCls} ${recovery ? "" : "text-center font-mono text-[18px] tracking-[0.4em]"}`} />
        </Labeled>
        {error && <ErrorBox>{error}</ErrorBox>}
        <Submit busy={busy}>Verify</Submit>
      </form>
      <button onClick={() => { setRecovery(!recovery); setCode(""); setError(null); }} className="mt-4 block text-[12px] font-medium text-[var(--brand)] hover:underline">
        {recovery ? "Use your authenticator app instead" : "Lost your device? Use a recovery code"}
      </button>
      <BackLink onClick={onBack} />
    </AuthShell>
  );
}

function PasskeyButton({ email, onError }: { email: string; onError: (m: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [supported, setSupported] = useState(false);
  useEffect(() => { setSupported(passkeysSupported()); }, []);
  if (!supported) return null;
  async function go() {
    setBusy(true); onError(null);
    const err = await loginWithPasskey(email || undefined);
    if (err) { onError(err); setBusy(false); }
  }
  return (
    <>
      <div className="my-4 flex items-center gap-3 text-[11px] text-[var(--faint)]"><span className="h-px flex-1 bg-[var(--border)]" /> or <span className="h-px flex-1 bg-[var(--border)]" /></div>
      <button type="button" onClick={go} disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-2.5 text-[13px] font-semibold text-[var(--text)] transition hover:border-[var(--brand)] hover:text-[var(--brand)] disabled:opacity-50">
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Fingerprint size={15} />} Sign in with a passkey
      </button>
    </>
  );
}

function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 font-medium transition ${active ? "bg-[var(--panel)] text-[var(--text)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--text)]"}`}>{children}</button>;
}
function EmailField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <Labeled label="Email"><input type="email" value={value} onChange={(e) => onChange(e.target.value)} placeholder="you@company.com" required className={inputCls} autoFocus /></Labeled>;
}
function PasswordField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <Labeled label="Password"><input type="password" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Your password" required className={inputCls} /></Labeled>;
}
function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[11.5px] font-medium text-[var(--muted)]">{label}</span>{children}</label>;
}
function Submit({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return <button type="submit" disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-[13.5px] font-semibold text-white shadow-[0_4px_14px_rgba(93,83,224,0.24)] transition hover:brightness-110 disabled:opacity-50">{busy && <Loader2 size={14} className="animate-spin" />}{children}</button>;
}
function ErrorBox({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-[var(--bad)] bg-[var(--panel)] px-3.5 py-2.5 text-[12px] font-medium text-[var(--bad)]">{children}</div>;
}
function BackLink({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick} className="mt-5 text-[12.5px] font-semibold text-[var(--brand)] hover:underline">← Back to sign in</button>;
}
function DevLink({ url }: { url: string }) {
  return <div className="mt-2 break-all rounded-lg border border-[var(--border)] bg-[var(--panel)] p-2 text-[11px]"><div className="mb-1 font-semibold text-[#8A6A2E]">Dev mode (no email sender):</div><a className="text-[var(--brand)] underline" href={url}>{url}</a></div>;
}
const inputCls = "w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3.5 py-2.5 text-[13.5px] text-[var(--text)] outline-none transition placeholder:text-[var(--faint)] focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15";
