"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const ROLES = [
  { value: "assessor", label: "Auditor / Assessor" },
  { value: "contributor", label: "Contributor" },
  { value: "viewer", label: "Viewer" },
  { value: "admin", label: "Admin" },
];

export default function InviteForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("assessor");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    if (!email || busy) return;
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Invite failed");
      setMsg(`Invitation sent to ${email} as ${ROLES.find((r) => r.value === role)?.label}.`);
      setEmail("");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Invite failed");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[#3b82f6]";

  return (
    <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label className="mb-1 block text-[11px] uppercase text-[var(--faint)]">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@company.com"
            className={`${field} w-full`}
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] uppercase text-[var(--faint)]">Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value)} className={field}>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        <button
          onClick={send}
          disabled={!email || busy}
          className="rounded-md bg-[#3b82f6] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Sending…" : "Send invite"}
        </button>
      </div>
      {msg && <p className="mt-2 text-[12.5px] text-[var(--good)]">{msg}</p>}
      {err && <p className="mt-2 text-[12.5px] text-red-500">{err}</p>}
      <p className="mt-2 text-[11px] text-[var(--faint)]">
        The role is applied automatically when they accept the invite and join.
      </p>
    </div>
  );
}
