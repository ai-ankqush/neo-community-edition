"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface SsoConfig {
  status: string;
  idp_type: string | null;
  email_domains: string | null;
  metadata_url: string | null;
  contact_email: string | null;
  notes: string | null;
}

const IDP = [
  { value: "okta", label: "Okta" },
  { value: "entra", label: "Microsoft Entra ID (Azure AD)" },
  { value: "google", label: "Google Workspace" },
  { value: "saml", label: "Other SAML 2.0" },
  { value: "oidc", label: "Other OIDC" },
  { value: "other", label: "Not sure / other" },
];

export default function SsoForm({ config }: { config: SsoConfig | null }) {
  const router = useRouter();
  const [idpType, setIdpType] = useState(config?.idp_type ?? "okta");
  const [emailDomains, setEmailDomains] = useState(config?.email_domains ?? "");
  const [metadataUrl, setMetadataUrl] = useState(config?.metadata_url ?? "");
  const [contactEmail, setContactEmail] = useState(config?.contact_email ?? "");
  const [notes, setNotes] = useState(config?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const ready = emailDomains.trim().length >= 3;

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/sso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idpType, emailDomains, metadataUrl, contactEmail, notes }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Could not submit");
      setDone(true);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not submit");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[#3b82f6]";

  if (done) {
    return (
      <div className="rounded-[10px] border border-[#22c55e40] bg-[#22c55e0a] p-5">
        <p className="text-sm font-semibold text-[var(--text)]">Request received ✓</p>
        <p className="mt-1 text-[13px] text-[var(--muted)]">
          We&apos;ll provision your enterprise connection and email you when it&apos;s active — usually within one
          business day. You can update these details any time on this page.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-5">
      <h3 className="text-sm font-bold text-[var(--text)]">
        {config ? "Update SSO details" : "Request SSO setup"}
      </h3>
      <p className="mb-4 mt-1 text-[13px] text-[var(--faint)]">
        Tell us about your identity provider and we&apos;ll set up the connection. Users from your verified
        domains will then sign in through your IdP and be added to this workspace automatically.
      </p>
      <div className="flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-[11px] uppercase text-[var(--faint)]">Identity provider</label>
          <select value={idpType} onChange={(e) => setIdpType(e.target.value)} className={field}>
            {IDP.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] uppercase text-[var(--faint)]">Company email domain(s)</label>
          <input value={emailDomains} onChange={(e) => setEmailDomains(e.target.value)} placeholder="acme.com, acme.co.uk" className={field} />
          <p className="mt-1 text-[11px] text-[var(--faint)]">Employees with these email domains will sign in via SSO.</p>
        </div>
        <div>
          <label className="mb-1 block text-[11px] uppercase text-[var(--faint)]">IdP metadata URL <span className="normal-case text-[var(--faint)]">(optional now)</span></label>
          <input value={metadataUrl} onChange={(e) => setMetadataUrl(e.target.value)} placeholder="https://idp.acme.com/app/.../sso/saml/metadata" className={field} />
          <p className="mt-1 text-[11px] text-[var(--faint)]">If you don&apos;t have it yet, leave blank — we&apos;ll send you the exact values your IdP needs.</p>
        </div>
        <div>
          <label className="mb-1 block text-[11px] uppercase text-[var(--faint)]">Your IT/security contact <span className="normal-case text-[var(--faint)]">(optional)</span></label>
          <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="it-admin@acme.com" className={field} />
        </div>
        <div>
          <label className="mb-1 block text-[11px] uppercase text-[var(--faint)]">Notes <span className="normal-case text-[var(--faint)]">(optional)</span></label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Anything we should know — timeline, specific requirements, etc." className={`${field} resize-y`} />
        </div>
        {err && <p className="text-[13px] text-red-500">{err}</p>}
        <button
          onClick={submit}
          disabled={!ready || busy}
          className="self-start rounded-md bg-[#3b82f6] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Submitting…" : config ? "Update request" : "Request SSO setup"}
        </button>
      </div>
    </div>
  );
}
