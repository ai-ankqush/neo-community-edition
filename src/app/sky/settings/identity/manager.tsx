"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, ShieldAlert, KeyRound, Plus, Trash2, Copy, Check } from "lucide-react";

type Connection = {
  connectionId: string;
  emailDomain: string;
  displayName: string;
  issuer: string;
  clientId: string | null;
  hasClientSecret: boolean;
  enabled: boolean;
  verified: boolean;
  verificationRecord: { host: string; type: string; value: string };
  redirectUri: string;
};
type ServiceKey = { key_id: string; name: string; key_prefix: string; role: string; created_at: string; last_used_at: string | null; revoked_at: string | null };

export default function IdentityManager() {
  return (
    <div className="mt-7 space-y-6">
      <SsoSection />
      <KeysSection />
    </div>
  );
}

/* ---------------------------------- SSO ---------------------------------- */

function SsoSection() {
  const [conn, setConn] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [form, setForm] = useState({ emailDomain: "", displayName: "", issuer: "", clientId: "", clientSecret: "", enabled: false });

  async function load() {
    const r = await fetch("/api/sky/identity/sso");
    const j = await r.json();
    if (j.connection) {
      setConn(j.connection);
      setForm({ emailDomain: j.connection.emailDomain, displayName: j.connection.displayName, issuer: j.connection.issuer, clientId: j.connection.clientId ?? "", clientSecret: "", enabled: j.connection.enabled });
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/sky/identity/sso", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, clientSecret: form.clientSecret || undefined }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not save.");
      setConn(j.connection);
      setForm((f) => ({ ...f, clientSecret: "" }));
      setMsg({ kind: j.probe?.ok ? "ok" : "err", text: j.probe?.detail ?? "Saved." });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Could not save." });
    } finally { setBusy(false); }
  }

  async function verify() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/sky/identity/sso/verify", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Verification failed.");
      setMsg(j.verified ? { kind: "ok", text: "Domain verified. You can enable SSO now." } : { kind: "err", text: `TXT record not found yet${j.found?.length ? ` (saw: ${j.found.join(", ")})` : ""}. DNS can take a few minutes.` });
      await load();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Verification failed." });
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!confirm("Remove this SSO connection?")) return;
    setBusy(true);
    await fetch("/api/sky/identity/sso", { method: "DELETE" });
    setConn(null);
    setForm({ emailDomain: "", displayName: "", issuer: "", clientId: "", clientSecret: "", enabled: false });
    setBusy(false);
  }

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[15px] font-bold text-[var(--text)]">Enterprise SSO</h2>
          <p className="mt-1 max-w-lg text-[12.5px] leading-relaxed text-[var(--muted)]">
            Let your people sign in with your own identity provider. Neo acts as the relying party — your IdP stays yours.
          </p>
        </div>
        {conn && (conn.verified ? <Badge tone="ok"><ShieldCheck size={12} /> Domain verified</Badge> : <Badge tone="warn"><ShieldAlert size={12} /> Unverified</Badge>)}
      </div>

      {loading ? (
        <div className="mt-4 text-[12.5px] text-[var(--faint)]">Loading…</div>
      ) : (
        <div className="mt-5 space-y-3.5">
          <Row label="Email domain" hint="People with this email domain will be offered SSO."><Input value={form.emailDomain} onChange={(v) => setForm({ ...form, emailDomain: v })} placeholder="acme.com" /></Row>
          <Row label="Display name"><Input value={form.displayName} onChange={(v) => setForm({ ...form, displayName: v })} placeholder="Acme (Okta)" /></Row>
          <Row label="Issuer URL" hint="Endpoints and signing keys are discovered automatically."><Input value={form.issuer} onChange={(v) => setForm({ ...form, issuer: v })} placeholder="https://acme.okta.com" /></Row>
          <Row label="Client ID"><Input value={form.clientId} onChange={(v) => setForm({ ...form, clientId: v })} placeholder="0oa1b2c3…" /></Row>
          <Row label="Client secret" hint={conn?.hasClientSecret ? "A secret is stored. Leave blank to keep it." : "Stored write-only."}>
            <Input value={form.clientSecret} onChange={(v) => setForm({ ...form, clientSecret: v })} placeholder={conn?.hasClientSecret ? "••••••••" : "Paste secret"} type="password" />
          </Row>

          {conn && (
            <>
              <Field label="Redirect URI — register this at your IdP" value={conn.redirectUri} />
              {!conn.verified && (
                <div className="rounded-xl border border-[#E4D4B0] bg-[#F7F0E2] p-3.5">
                  <div className="text-[12.5px] font-semibold text-[#8A6A2E]">Prove you own {conn.emailDomain}</div>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-[#8A6A2E]">
                    Add this DNS record, then click Verify. SSO can&apos;t go live until it resolves — this stops anyone else claiming your domain.
                  </p>
                  <div className="mt-2 space-y-1.5">
                    <Field label="Host" value={conn.verificationRecord.host} small />
                    <Field label="Type" value="TXT" small />
                    <Field label="Value" value={conn.verificationRecord.value} small />
                  </div>
                </div>
              )}
              <label className="flex items-center gap-2 text-[12.5px] text-[var(--text)]">
                <input type="checkbox" checked={form.enabled} disabled={!conn.verified} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
                Enable SSO for this domain {!conn.verified && <span className="text-[var(--faint)]">(verify the domain first)</span>}
              </label>
            </>
          )}

          {msg && <div className={`rounded-xl border px-3.5 py-2.5 text-[12px] ${msg.kind === "ok" ? "border-[#BEDBC9] bg-[#E9F2EC] text-[var(--good)]" : "border-[#EFCFCB] bg-[#FBEEEC] text-[var(--bad)]"}`}>{msg.text}</div>}

          <div className="flex flex-wrap gap-2 pt-1">
            <Primary onClick={save} busy={busy}>{conn ? "Save changes" : "Create connection"}</Primary>
            {conn && !conn.verified && <Secondary onClick={verify} busy={busy}>Verify domain</Secondary>}
            {conn && <Secondary onClick={remove} busy={busy}>Remove</Secondary>}
          </div>
        </div>
      )}
    </section>
  );
}

/* ------------------------------ service keys ------------------------------ */

function KeysSection() {
  const [keys, setKeys] = useState<ServiceKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ token: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    const r = await fetch("/api/sky/identity/keys");
    const j = await r.json();
    setKeys(j.keys ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    const r = await fetch("/api/sky/identity/keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    const j = await r.json();
    if (r.ok) { setIssued({ token: j.token }); setName(""); await load(); }
    setBusy(false);
  }
  async function revoke(keyId: string) {
    await fetch("/api/sky/identity/keys", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ keyId }) });
    await load();
  }

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5">
      <h2 className="text-[15px] font-bold text-[var(--text)]">Service keys</h2>
      <p className="mt-1 max-w-lg text-[12.5px] leading-relaxed text-[var(--muted)]">
        For agents and services that have no identity provider of their own. A key authenticates as your organization —
        every action it takes still passes the same gate and lands in the same ledger.
      </p>

      {issued && (
        <div className="mt-4 rounded-xl border border-[#BEDBC9] bg-[#E9F2EC] p-3.5">
          <div className="text-[12.5px] font-semibold text-[var(--good)]">Copy this key now — it won&apos;t be shown again.</div>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 break-all rounded-lg border border-[var(--border)] bg-[var(--panel)] px-2.5 py-2 font-mono text-[11.5px] text-[var(--text)]">{issued.token}</code>
            <button onClick={() => { navigator.clipboard.writeText(issued.token); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-2.5 py-2 text-[12px] font-medium text-[var(--text)] hover:border-[var(--brand)]">
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button onClick={() => setIssued(null)} className="mt-2 text-[11.5px] font-medium text-[var(--good)] hover:underline">Done</button>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Key name (e.g. support-agent)"
          className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3.5 py-2.5 text-[13px] text-[var(--text)] outline-none focus:border-[var(--brand)]" />
        <Primary onClick={create} busy={busy}><Plus size={13} /> Create key</Primary>
      </div>

      <div className="mt-4 space-y-1.5">
        {loading ? <div className="text-[12.5px] text-[var(--faint)]">Loading…</div>
          : keys.length === 0 ? <div className="text-[12.5px] text-[var(--faint)]">No service keys yet.</div>
          : keys.map((k) => (
            <div key={k.key_id} className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[12.5px] font-medium text-[var(--text)]">
                  <KeyRound size={13} className="text-[var(--brand)]" />{k.name}
                  {k.revoked_at && <span className="rounded-md bg-[#FBEEEC] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--bad)]">revoked</span>}
                </div>
                <div className="mt-0.5 font-mono text-[10.5px] text-[var(--faint)]">{k.key_prefix}… · {k.role} · added {new Date(k.created_at).toLocaleDateString()}{k.last_used_at ? ` · last used ${new Date(k.last_used_at).toLocaleDateString()}` : ""}</div>
              </div>
              {!k.revoked_at && <button onClick={() => revoke(k.key_id)} className="text-[var(--faint)] hover:text-[var(--bad)]" aria-label="Revoke key"><Trash2 size={14} /></button>}
            </div>
          ))}
      </div>
    </section>
  );
}

/* -------------------------------- bits -------------------------------- */

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11.5px] font-medium text-[var(--muted)]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-[var(--faint)]">{hint}</span>}
    </label>
  );
}
function Input({ value, onChange, placeholder, type = "text" }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
    className="w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3.5 py-2.5 text-[13px] text-[var(--text)] outline-none transition placeholder:text-[var(--faint)] focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15" />;
}
function Field({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div>
      <div className={`mb-1 ${small ? "text-[10.5px]" : "text-[11.5px]"} font-medium text-[var(--muted)]`}>{label}</div>
      <code className="block break-all rounded-lg border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1.5 font-mono text-[11.5px] text-[var(--text)]">{value}</code>
    </div>
  );
}
function Badge({ tone, children }: { tone: "ok" | "warn"; children: React.ReactNode }) {
  const cls = tone === "ok" ? "border-[#BEDBC9] bg-[#E9F2EC] text-[var(--good)]" : "border-[#E4D4B0] bg-[#F7F0E2] text-[#8A6A2E]";
  return <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1 text-[10.5px] font-bold uppercase tracking-wide ${cls}`}>{children}</span>;
}
function Primary({ onClick, busy, children }: { onClick: () => void; busy: boolean; children: React.ReactNode }) {
  return <button onClick={onClick} disabled={busy} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_4px_14px_rgba(93,83,224,0.24)] transition hover:brightness-110 disabled:opacity-50">{busy && <Loader2 size={13} className="animate-spin" />}{children}</button>;
}
function Secondary({ onClick, busy, children }: { onClick: () => void; busy: boolean; children: React.ReactNode }) {
  return <button onClick={onClick} disabled={busy} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-2.5 text-[13px] font-semibold text-[var(--text)] transition hover:border-[var(--brand)] hover:text-[var(--brand)] disabled:opacity-50">{children}</button>;
}
