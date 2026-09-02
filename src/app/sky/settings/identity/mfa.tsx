"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, Smartphone, Copy, Check } from "lucide-react";

/** Your own second factor. Passkeys are phishing-resistant; this protects the password path. */
export default function MfaSection() {
  const [enabled, setEnabled] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enroll, setEnroll] = useState<{ secretB32: string; otpauth: string } | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    const r = await fetch("/api/sky/identity/mfa");
    const j = await r.json();
    setEnabled(!!j.enabled); setRemaining(j.recoveryRemaining ?? 0); setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function call(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/sky/identity/mfa", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Something went wrong.");
      return j;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      return null;
    } finally { setBusy(false); }
  }

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-bold text-[var(--text)]">Two-factor authentication</h2>
          <p className="mt-1 max-w-lg text-[12.5px] leading-relaxed text-[var(--muted)]">
            Require a code from your authenticator app after your password. A stolen password on its own stops being enough.
          </p>
        </div>
        {enabled && (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#BEDBC9] bg-[#E9F2EC] px-2 py-1 text-[10.5px] font-bold uppercase tracking-wide text-[var(--good)]">
            <ShieldCheck size={12} /> On
          </span>
        )}
      </div>

      {error && <div className="mt-3 rounded-xl border border-[#EFCFCB] bg-[#FBEEEC] px-3.5 py-2.5 text-[12px] text-[var(--bad)]">{error}</div>}

      {codes && (
        <div className="mt-4 rounded-xl border border-[#E4D4B0] bg-[#F7F0E2] p-3.5">
          <div className="text-[12.5px] font-semibold text-[#8A6A2E]">Save these recovery codes now — each works once, and they won&apos;t be shown again.</div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {codes.map((c) => <code key={c} className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1.5 text-center font-mono text-[12px] text-[var(--text)]">{c}</code>)}
          </div>
          <div className="mt-2.5 flex gap-2">
            <button onClick={() => { navigator.clipboard.writeText(codes.join("\n")); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--text)] hover:border-[var(--brand)]">
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy all"}
            </button>
            <button onClick={() => { setCodes(null); load(); }} className="text-[12px] font-semibold text-[var(--brand)] hover:underline">I&apos;ve saved them</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="mt-4 text-[12.5px] text-[var(--faint)]">Loading…</div>
      ) : enroll ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5">
            <div className="flex items-center gap-2 text-[12.5px] font-semibold text-[var(--text)]"><Smartphone size={14} className="text-[var(--brand)]" /> Add Neo Sky to your authenticator</div>
            <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--muted)]">
              Open your authenticator app (1Password, Authy, Google Authenticator…) and add an account using this key:
            </p>
            <code className="mt-2 block break-all rounded-lg border border-[var(--border)] bg-[var(--panel)] px-2.5 py-2 text-center font-mono text-[13px] tracking-[0.15em] text-[var(--text)]">{enroll.secretB32}</code>
            <a href={enroll.otpauth} className="mt-2 inline-block text-[11.5px] font-medium text-[var(--brand)] hover:underline">Or tap to open in your authenticator app</a>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-[11.5px] font-medium text-[var(--muted)]">Enter the 6-digit code it shows</span>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" inputMode="numeric" autoComplete="one-time-code"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3.5 py-2.5 text-center font-mono text-[18px] tracking-[0.4em] text-[var(--text)] outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15" />
          </label>
          <div className="flex gap-2">
            <Primary busy={busy} onClick={async () => { const j = await call("confirm", { code }); if (j?.ok) { setEnroll(null); setCode(""); setCodes(j.recoveryCodes); setEnabled(true); } }}>Turn on 2FA</Primary>
            <Secondary onClick={() => { setEnroll(null); setCode(""); setError(null); }}>Cancel</Secondary>
          </div>
        </div>
      ) : enabled ? (
        <div className="mt-4 space-y-3">
          <div className="text-[12.5px] text-[var(--muted)]">
            {remaining} recovery {remaining === 1 ? "code" : "codes"} remaining.
            {remaining <= 2 && <span className="ml-1 font-semibold text-[var(--warn)]">Consider generating new ones.</span>}
          </div>
          <label className="block max-w-[220px]">
            <span className="mb-1.5 block text-[11.5px] font-medium text-[var(--muted)]">Current code (to confirm changes)</span>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" inputMode="numeric"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3.5 py-2 text-center font-mono text-[15px] tracking-[0.3em] text-[var(--text)] outline-none focus:border-[var(--brand)]" />
          </label>
          <div className="flex flex-wrap gap-2">
            <Secondary onClick={async () => { const j = await call("regenerate", { code }); if (j?.ok) { setCode(""); setCodes(j.recoveryCodes); } }}>New recovery codes</Secondary>
            <Secondary onClick={async () => { if (!confirm("Turn off two-factor authentication?")) return; const j = await call("disable", { code }); if (j?.ok) { setCode(""); setEnabled(false); load(); } }}>Turn off 2FA</Secondary>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <Primary busy={busy} onClick={async () => { const j = await call("start"); if (j?.secretB32) setEnroll(j); }}>Set up 2FA</Primary>
        </div>
      )}
    </section>
  );
}

function Primary({ onClick, busy, children }: { onClick: () => void; busy?: boolean; children: React.ReactNode }) {
  return <button onClick={onClick} disabled={busy} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_4px_14px_rgba(93,83,224,0.24)] transition hover:brightness-110 disabled:opacity-50">{busy && <Loader2 size={13} className="animate-spin" />}{children}</button>;
}
function Secondary({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-2.5 text-[13px] font-semibold text-[var(--text)] transition hover:border-[var(--brand)] hover:text-[var(--brand)]">{children}</button>;
}
