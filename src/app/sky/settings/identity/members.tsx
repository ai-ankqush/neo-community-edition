"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, ChevronDown, X, Users } from "lucide-react";

type Member = { userId: string; email: string; displayName: string | null; roleKeys: string[]; twoFactor: boolean };
type Role = { key: string; name: string; description: string; grants: string[]; system: boolean };

/** Who holds which role — authorization made visible and editable. */
export default function MembersSection() {
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [me, setMe] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openRole, setOpenRole] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  async function load() {
    const r = await fetch("/api/sky/identity/members");
    const j = await r.json();
    if (!r.ok) { setError(j.error || "Could not load members."); setLoading(false); return; }
    setMembers(j.members ?? []); setRoles(j.roles ?? []); setMe(j.me ?? ""); setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function change(userId: string, roleKey: string, action: "assign" | "revoke") {
    setError(null); setAdding(null);
    const r = await fetch("/api/sky/identity/members", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, roleKey, action }) });
    const j = await r.json();
    if (!r.ok) { setError(j.error || "Could not update roles."); return; }
    setMembers(j.members ?? []);
  }

  const roleName = (key: string) => roles.find((r) => r.key === key)?.name ?? key;

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5">
      <div className="flex items-center gap-2">
        <Users size={15} className="text-[var(--brand)]" />
        <h2 className="text-[15px] font-bold text-[var(--text)]">People &amp; roles</h2>
      </div>
      <p className="mt-1 max-w-lg text-[12.5px] leading-relaxed text-[var(--muted)]">
        A role is a bundle of permissions. Someone&apos;s access is the union of every role they hold — and roles decide
        what a person may <span className="italic">ask</span> for, before Gravity decides whether it may happen.
      </p>

      {error && <div className="mt-3 rounded-xl border border-[#EFCFCB] bg-[#FBEEEC] px-3.5 py-2.5 text-[12px] text-[var(--bad)]">{error}</div>}

      <div className="mt-4 space-y-1.5">
        {loading ? <div className="text-[12.5px] text-[var(--faint)]">Loading…</div>
          : members.length === 0 ? <div className="text-[12.5px] text-[var(--faint)]">No members yet.</div>
          : members.map((m) => (
            <div key={m.userId} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[13px] font-medium text-[var(--text)]">
                    {m.displayName || m.email}
                    {m.userId === me && <span className="rounded-md bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--muted)]">you</span>}
                    {m.twoFactor && <span title="Two-factor enabled"><ShieldCheck size={13} className="text-[var(--good)]" /></span>}
                  </div>
                  {m.displayName && <div className="text-[11.5px] text-[var(--faint)]">{m.email}</div>}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {m.roleKeys.length === 0 && <span className="text-[11.5px] italic text-[var(--faint)]">no role — no access</span>}
                  {m.roleKeys.map((rk) => (
                    <span key={rk} className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-strong)] bg-[var(--panel)] px-2 py-1 text-[11.5px] font-medium text-[var(--text)]">
                      {roleName(rk)}
                      <button onClick={() => change(m.userId, rk, "revoke")} className="text-[var(--faint)] hover:text-[var(--bad)]" aria-label={`Remove ${roleName(rk)}`}><X size={11} /></button>
                    </span>
                  ))}
                  <div className="relative">
                    <button onClick={() => setAdding(adding === m.userId ? null : m.userId)}
                      className="inline-flex items-center gap-1 rounded-lg border border-dashed border-[var(--border-strong)] px-2 py-1 text-[11.5px] font-medium text-[var(--muted)] hover:border-[var(--brand)] hover:text-[var(--brand)]">
                      Add role <ChevronDown size={11} />
                    </button>
                    {adding === m.userId && (
                      <div className="absolute right-0 z-10 mt-1 w-60 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--panel)] shadow-lg">
                        {roles.filter((r) => !m.roleKeys.includes(r.key)).map((r) => (
                          <button key={r.key} onClick={() => change(m.userId, r.key, "assign")} className="block w-full px-3 py-2 text-left hover:bg-[var(--surface)]">
                            <div className="text-[12px] font-medium text-[var(--text)]">{r.name}</div>
                            <div className="text-[10.5px] leading-snug text-[var(--faint)]">{r.description}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
      </div>

      <div className="mt-5 border-t border-[var(--border)] pt-4">
        <div className="text-[12px] font-semibold text-[var(--text)]">What the roles grant</div>
        <div className="mt-2 space-y-1">
          {roles.map((r) => (
            <div key={r.key} className="rounded-lg border border-[var(--border)] bg-[var(--surface)]">
              <button onClick={() => setOpenRole(openRole === r.key ? null : r.key)} className="flex w-full items-center justify-between px-3 py-2 text-left">
                <span className="text-[12.5px] font-medium text-[var(--text)]">{r.name} {!r.system && <span className="ml-1 text-[10px] font-semibold uppercase text-[var(--horizon-deep)]">custom</span>}</span>
                <ChevronDown size={13} className={`text-[var(--faint)] transition ${openRole === r.key ? "rotate-180" : ""}`} />
              </button>
              {openRole === r.key && (
                <div className="border-t border-[var(--border)] px-3 py-2">
                  <div className="text-[11.5px] leading-relaxed text-[var(--muted)]">{r.description}</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {r.grants.map((g) => <code key={g} className="rounded bg-[var(--panel)] px-1.5 py-0.5 font-mono text-[10.5px] text-[var(--muted)]">{g}</code>)}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
