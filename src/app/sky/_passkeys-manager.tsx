"use client";

import { useEffect, useState } from "react";
import { Fingerprint, Loader2, Plus, Trash2 } from "lucide-react";
import { registerPasskey, passkeysSupported } from "./_passkey";

type Passkey = { credential_id: string; label: string | null; created_at: string; last_used_at: string | null };

export default function PasskeysManager() {
  const [list, setList] = useState<Passkey[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);

  async function load() {
    const r = await fetch("/api/sky/auth/passkey/list");
    const j = await r.json();
    setList(j.passkeys ?? []);
    setLoading(false);
  }
  useEffect(() => { setSupported(passkeysSupported()); load(); }, []);

  async function add() {
    setBusy(true); setError(null);
    const err = await registerPasskey();
    if (err) setError(err); else await load();
    setBusy(false);
  }
  async function remove(id: string) {
    setError(null);
    await fetch("/api/sky/auth/passkey/delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ credentialId: id }) });
    await load();
  }

  return (
    <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--text)]"><Fingerprint size={15} className="text-[var(--brand)]" /> Passkeys</div>
        {supported && (
          <button onClick={add} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--brand)] px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-[#3b4a70] disabled:opacity-50">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add a passkey
          </button>
        )}
      </div>
      <p className="mt-1 text-[11.5px] text-[var(--muted)]">Sign in without a password using your device biometrics or a security key.</p>
      {error && <div className="mt-2 rounded-lg border border-[#EFCFCB] bg-[#FBEEEC] px-3 py-2 text-[12px] text-[var(--bad)]">{error}</div>}
      {!supported && <div className="mt-2 text-[12px] text-[var(--faint)]">This browser doesn&apos;t support passkeys.</div>}

      <div className="mt-3 space-y-1.5">
        {loading ? (
          <div className="text-[12px] text-[var(--faint)]">Loading…</div>
        ) : list.length === 0 ? (
          <div className="text-[12px] text-[var(--faint)]">No passkeys yet.</div>
        ) : (
          list.map((p) => (
            <div key={p.credential_id} className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
              <div className="text-[12.5px] text-[var(--text)]">
                {p.label || "Passkey"}
                <span className="ml-2 text-[10.5px] text-[var(--faint)]">added {new Date(p.created_at).toLocaleDateString()}{p.last_used_at ? ` · last used ${new Date(p.last_used_at).toLocaleDateString()}` : ""}</span>
              </div>
              <button onClick={() => remove(p.credential_id)} className="text-[var(--faint)] hover:text-[var(--bad)]" aria-label="Remove passkey"><Trash2 size={14} /></button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
