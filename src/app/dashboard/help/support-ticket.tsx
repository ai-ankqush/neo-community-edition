"use client";

import { useState } from "react";
import { useIdentity } from "@/ce/auth-ui";
import { BRAND } from "@/lib/brand";

// Email-only ticketing: posts to Formspree, which emails the support inbox.
// No in-app ticket record is stored. Swap this endpoint for a dedicated
// Formspree form if you want support separated from website inquiries.
const FORMSPREE = "https://formspree.io/f/xqeoeydk";

const CATEGORIES = ["Question / how-to", "Something's broken", "Billing", "Feature request", "Other"];

export default function SupportTicket() {
  const { email, name, orgName } = useIdentity();
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = subject.trim().length > 2 && message.trim().length > 5;

  async function submit() {
    if (!ready || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(FORMSPREE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          _subject: `${BRAND.name} support — [${category}] ${subject}`,
          name,
          email,
          replyto: email,
          organization: orgName || "—",
          category,
          message,
        }),
      });
      if (res.ok) setSent(true);
      else setError(`Could not send. Please email ${BRAND.contactEmail} directly.`);
    } catch {
      setError(`Could not send. Please email ${BRAND.contactEmail} directly.`);
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-[10px] border border-[#22c55e40] bg-[#22c55e0a] p-5">
        <p className="text-sm font-semibold text-[var(--text)]">Ticket sent ✓</p>
        <p className="mt-1 text-[13px] text-[var(--muted)]">
          Thanks — we&apos;ll reply to {email || "your email"} as soon as we can.
        </p>
      </div>
    );
  }

  const field = "w-full rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[#3b82f6]";

  return (
    <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-5">
      <h3 className="text-sm font-bold text-[var(--text)]">Open a support ticket</h3>
      <p className="mb-4 mt-1 text-[13px] text-[var(--faint)]">
        Can&apos;t find it in the articles or via Ask {BRAND.name}? Send us a ticket and we&apos;ll get back to you by email.
      </p>
      <div className="flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-[11px] uppercase text-[var(--faint)]">Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={field}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] uppercase text-[var(--faint)]">Subject</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Short summary" className={field} />
        </div>
        <div>
          <label className="mb-1 block text-[11px] uppercase text-[var(--faint)]">Details</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} placeholder="What happened, what you expected, and any steps to reproduce." className={`${field} resize-y`} />
        </div>
        {error && <p className="text-[13px] text-red-500">{error}</p>}
        <p className="text-[12px] text-[var(--faint)]">We&apos;ll reply to the email on your account.</p>
        <button
          onClick={submit}
          disabled={!ready || sending}
          className="self-start rounded-md bg-[#3b82f6] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {sending ? "Sending…" : "Send ticket"}
        </button>
      </div>
    </div>
  );
}
