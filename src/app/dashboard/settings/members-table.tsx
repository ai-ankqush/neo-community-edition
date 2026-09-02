"use client";

import { useEffect, useState } from "react";

interface Member {
  userId: string;
  name: string;
  email: string;
  imageUrl: string | null;
  clerkRole: string;
  platformRole: string;
  isSelf: boolean;
}

interface PendingInvite {
  id: string;
  email: string;
  role: string;
}

const ROLE_DESCRIPTIONS: Record<string, string> = {
  org_admin: "Full control: members, billing, approvals, delete",
  assessor: "Auditor / Assessor — create use cases, run stages, accept drafts, verify",
  contributor: "Answer questions, complete tasks, upload evidence",
  viewer: "Read-only access and exports",
};

const ROLE_LABELS: Record<string, string> = {
  org_admin: "Admin",
  assessor: "Auditor / Assessor",
  contributor: "Contributor",
  viewer: "Viewer",
};

export default function MembersTable() {
  const [members, setMembers] = useState<Member[]>([]);
  const [pending, setPending] = useState<PendingInvite[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/members");
      if (!res.ok) throw new Error("Failed to load members");
      const json = await res.json();
      setMembers(json.members ?? []);
      setPending(json.pendingInvites ?? []);
      setCanManage(json.canManage ?? false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function setRole(userId: string, role: string) {
    const res = await fetch("/api/members", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      alert(typeof json.error === "string" ? json.error : "Failed to update role");
      return;
    }
    load();
  }

  async function remove(userId: string, name: string) {
    if (!confirm(`Remove ${name} from this workspace?`)) return;
    const res = await fetch("/api/members", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      alert(typeof json.error === "string" ? json.error : "Failed to remove member");
      return;
    }
    load();
  }

  async function setPendingRole(email: string, role: string) {
    const res = await fetch("/api/members/pending", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); alert(typeof j.error === "string" ? j.error : "Failed"); return; }
    load();
  }

  async function revokeInvite(id: string, email: string) {
    if (!confirm(`Revoke the invitation to ${email}?`)) return;
    const res = await fetch("/api/members/pending", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invitationId: id, email }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); alert(typeof j.error === "string" ? j.error : "Failed to revoke"); return; }
    load();
  }

  if (loading) return <p className="p-5 text-sm text-[var(--faint)]">Loading members...</p>;
  if (error) return <p className="p-5 text-sm text-red-500">{error}</p>;

  return (
   <>
    <table className="w-full min-w-[640px] text-[13px]">
      <thead className="bg-[var(--panel)]">
        <tr>
          <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase text-[var(--faint)]">Member</th>
          <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase text-[var(--faint)]">Platform Role</th>
          <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase text-[var(--faint)]">Permissions</th>
          {canManage && <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase text-[var(--faint)]"></th>}
        </tr>
      </thead>
      <tbody>
        {members.map((m) => (
          <tr key={m.userId} className="border-t border-[var(--surface-2)]">
            <td className="px-4 py-3">
              <div className="flex items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {m.imageUrl && <img src={m.imageUrl} alt="" className="h-7 w-7 rounded-full" />}
                <div>
                  <p className="font-medium text-[var(--text)]">{m.name}</p>
                  <p className="text-xs text-[var(--faint)]">{m.email}</p>
                </div>
              </div>
            </td>
            <td className="px-4 py-3">
              {m.isSelf ? (
                <span className="text-[var(--muted)]">You · <span className="text-[var(--text)]">{ROLE_LABELS[m.platformRole] ?? m.platformRole}</span></span>
              ) : canManage ? (
                <select
                  value={m.platformRole}
                  onChange={(e) => setRole(m.userId, e.target.value)}
                  className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1.5 text-[13px] text-[var(--text)] outline-none focus:border-[#3b82f6]"
                >
                  <option value="org_admin">Admin</option>
                  <option value="assessor">Auditor / Assessor</option>
                  <option value="contributor">Contributor</option>
                  <option value="viewer">Viewer</option>
                </select>
              ) : (
                <span className="text-[var(--muted)]">{ROLE_LABELS[m.platformRole] ?? m.platformRole}</span>
              )}
            </td>
            <td className="px-4 py-3 text-xs text-[var(--faint)]">
              {ROLE_DESCRIPTIONS[m.platformRole] ?? "—"}
            </td>
            {canManage && (
              <td className="px-4 py-3 text-right">
                {!m.isSelf && (
                  <button onClick={() => remove(m.userId, m.name)} className="text-[12px] text-[#ef4444] hover:underline">
                    Remove
                  </button>
                )}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>

    {pending.length > 0 && (
      <div className="border-t border-[var(--border)]">
        <div className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--faint)]">Pending invitations · {pending.length}</div>
        {pending.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-2 border-t border-[var(--surface-2)] px-4 py-2.5 text-[13px]">
            <div className="min-w-0">
              <p className="font-medium text-[var(--text)]">{p.email}</p>
              <p className="text-[11px] text-[#f59e0b]">Invited — not yet joined</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {canManage ? (
                <select
                  value={p.role}
                  onChange={(e) => setPendingRole(p.email, e.target.value)}
                  className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1.5 text-[12.5px] text-[var(--text)] outline-none focus:border-[#3b82f6]"
                >
                  <option value="org_admin">Admin</option>
                  <option value="assessor">Auditor / Assessor</option>
                  <option value="contributor">Contributor</option>
                  <option value="viewer">Viewer</option>
                </select>
              ) : (
                <span className="text-[var(--muted)]">{ROLE_LABELS[p.role] ?? p.role}</span>
              )}
              {canManage && (
                <button onClick={() => revokeInvite(p.id, p.email)} className="text-[12px] text-[#ef4444] hover:underline">Revoke</button>
              )}
            </div>
          </div>
        ))}
      </div>
    )}
   </>
  );
}
