"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";

export default function NewUseCasePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [businessFunction, setBusinessFunction] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const FUNCTIONS = ["IT", "Security", "Legal", "HR", "Finance", "Marketing", "Sales", "Support", "Customer Relations", "Operations", "Company-wide", "Other"];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/use-cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, businessFunction, ownerName, ownerEmail }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.code === "byo_key_required") { router.push("/dashboard/settings?tab=model-provider"); return; }
        throw new Error(typeof json.error === "string" ? json.error : "Failed to create");
      }
      router.push(`/dashboard/use-cases/${json.useCase.id}/setup`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[#3b82f6]">New use case · Step 1 of 2</div>
      <h1 className="mb-1 text-2xl font-bold text-[var(--text)]">Describe the use case</h1>
      <p className="mb-6 text-sm text-[var(--muted)]">
        Describe the AI use case in plain language. The more detail you give, the
        sharper the assessment — but if you&apos;re not sure about something, leave it
        out and {BRAND.name} will ask follow-up questions.
      </p>

      <form onSubmit={submit} className="space-y-5 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
        <div>
          <label className="mb-1 block text-sm font-semibold text-[var(--text)]">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            placeholder="e.g. HR Policy Assistant"
            className="w-full rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-cyan-brand"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-semibold text-[var(--text)]">Business function</label>
            <select
              value={businessFunction}
              onChange={(e) => setBusinessFunction(e.target.value)}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-cyan-brand"
            >
              <option value="">Which team does this belong to?</option>
              {FUNCTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-[var(--text)]">Use-case owner <span className="font-normal text-[var(--faint)]">(person or team)</span></label>
            <input
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="e.g. Jane Doe, or HR Ops team"
              className="w-full rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-cyan-brand"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-[var(--text)]">Owner email <span className="font-normal text-[var(--faint)]">(optional — they don&apos;t need a {BRAND.name} login)</span></label>
          <input
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
            type="email"
            placeholder="owner@company.com"
            className="w-full rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-cyan-brand"
          />
          <p className="mt-1 text-[11px] text-[var(--faint)]">You&apos;ll be recorded as the assessor. The owner is who&apos;s accountable for the AI use case — it can differ from you.</p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold text-[var(--text)]">Description</label>
          <p className="mb-2 text-[12.5px] leading-relaxed text-[var(--muted)]">
            Add as much as you can — go into as much detail as you like. Helpful things to include:
          </p>
          <ul className="mb-2 ml-4 list-disc space-y-0.5 text-[12px] leading-relaxed text-[var(--faint)]">
            <li>What it does and the business purpose it serves</li>
            <li>The data, systems, and context it can access</li>
            <li>Whether it influences decisions or can take actions / call tools</li>
            <li>The technology stack it&apos;s built on</li>
            <li>Who uses it, and any requirements, constraints, or policies it must meet</li>
          </ul>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={8}
            placeholder={`Describe the use case here — the more detail the better. Don't worry about getting it perfect; ${BRAND.name} will ask follow-up questions for anything it needs.`}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-cyan-brand"
          />
        </div>
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-[#3b82f6] px-6 py-2 text-sm font-semibold text-[var(--text)] disabled:opacity-50"
        >
          {busy ? "Creating..." : "Continue — select technology →"}
        </button>
      </form>
    </div>
  );
}
