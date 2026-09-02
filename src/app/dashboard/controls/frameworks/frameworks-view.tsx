"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Library, Sparkles, Plus, Trash2, Check, Search, Pencil } from "lucide-react";
import type { OrgFramework, FrameworkMapping } from "@/server/frameworks/custom";
import { BRAND } from "@/lib/brand";

interface KnownFramework { name: string; authority: string; catalogued?: boolean }

/**
 * Bring-your-own-framework. A customer adds their own control framework and maps Neo's controls to it
 * — by pillar (the base), which flows to every control in that pillar. Neo proposes the crosswalk;
 * the human confirms. This is the management surface; the mappings then appear as a column alongside
 * the built-in crosswalks everywhere controls are shown.
 */
export default function FrameworksView({
  frameworks, mappings, pillars, known, canCreate = false,
}: {
  frameworks: OrgFramework[];
  mappings: FrameworkMapping[];
  pillars: { pillar: number; name: string }[];
  known: KnownFramework[];
  canCreate?: boolean; // defining a framework is a governance act — admin-only
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [authority, setAuthority] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Typeahead over the broad known-framework list. Free text is always allowed — you can add ANY
  // framework by name; Neo will map from its knowledge or you paste the catalogue.
  const matches = useMemo(() => {
    const q = name.trim().toLowerCase();
    if (!q) return known.slice(0, 8);
    const exact = known.some((k) => k.name.toLowerCase() === q);
    if (exact) return [];
    return known.filter((k) => k.name.toLowerCase().includes(q) || k.authority.toLowerCase().includes(q)).slice(0, 8);
  }, [name, known]);

  async function createFramework() {
    if (name.trim().length < 2) return;
    setBusy("create"); setError(null);
    const r = await fetch("/api/frameworks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), authority: authority.trim() || undefined }) });
    setBusy(null);
    if (r.ok) { setName(""); setAuthority(""); setAdding(false); router.refresh(); }
    else { const j = await r.json().catch(() => ({})); setError(j.error ? String(j.error) : `Couldn't add framework (${r.status}). You may need an admin or assessor role.`); }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-start gap-2">
        <Library size={18} className="mt-0.5 text-[#0d9488]" />
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-[#0d9488]">Controls · your frameworks</div>
          <h1 className="text-[19px] font-bold text-[var(--text)]">Map controls to your own framework</h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[var(--muted)]">
            {BRAND.name} ships crosswalks to NIST AI RMF, ISO 42001, the EU AI Act, SR 11-7 and NYDFS. Add your <b>own</b> control
            framework here — an internal standard, a regulator&rsquo;s template, a client&rsquo;s requirements — and map it by
            pillar. {BRAND.name} proposes the crosswalk; you confirm. Every control in a pillar inherits the mapping, with per-control
            overrides where needed.
          </p>
        </div>
      </div>

      {/* add framework — admin only (defining a framework is a governance act) */}
      {!canCreate ? (
        <div className="mt-5 rounded-md border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-[12.5px] text-[var(--muted)]">
          Defining a framework sets a standard the whole workspace is measured against, so it&rsquo;s an <b>admin</b> action.
          You can view every framework and its crosswalk here; ask an admin to add a new one.
        </div>
      ) : (
      <div className="mt-5">
        {adding ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {/* searchable lookup by name — like the integrations/tech catalog; any framework allowed */}
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--faint)]" />
                <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off"
                  placeholder="Look up a framework, or type your own…"
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] py-2 pl-8 pr-3 text-[13px] text-[var(--text)] outline-none focus:border-[#0d9488]" />
                {matches.length > 0 && (
                  <div className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border border-[var(--border)] bg-[var(--panel)] shadow-xl">
                    {matches.map((k) => (
                      <button key={k.name} type="button" onClick={() => { setName(k.name); setAuthority(k.authority); }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-[var(--text)] hover:bg-[var(--surface)]">
                        <span className="flex-1">{k.name}</span>
                        <span className="text-[10.5px] text-[var(--faint)]">{k.authority}</span>
                        {k.catalogued && <span className="rounded bg-[#052e2e] px-1.5 py-0.5 text-[9px] font-bold text-[#06d6d6]">catalogued</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input value={authority} onChange={(e) => setAuthority(e.target.value)} placeholder="Owner / authority (optional) — e.g. Group Risk"
                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[#0d9488]" />
            </div>
            <p className="mt-2 text-[11px] text-[var(--faint)]">
              Type any framework — an industry standard, a regulator template, or your own internal one. For a recognised
              standard {BRAND.name} recalls its <b>actual control catalogue</b> and maps to real control IDs;{" "}
              <span className="text-[#06d6d6]">catalogued</span> ones are curated for pinpoint accuracy, and you can always paste a
              control list for anything niche or private.
            </p>
            {error && <p className="mt-2 text-[12px] text-[#ef4444]">{error}</p>}
            <div className="mt-3 flex items-center gap-2">
              <button onClick={createFramework} disabled={busy === "create" || name.trim().length < 2}
                className="rounded-md bg-[#0d9488] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">
                {busy === "create" ? "Adding…" : "Add framework"}
              </button>
              <button onClick={() => { setAdding(false); setName(""); setAuthority(""); setError(null); }} className="text-[12px] text-[var(--faint)] hover:text-[var(--text)]">Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] font-semibold text-[var(--text)] hover:border-[#0d9488]">
            <Plus size={15} /> Add a framework
          </button>
        )}
      </div>
      )}

      {frameworks.length === 0 ? (
        <p className="mt-6 text-[13px] text-[var(--muted)]">No custom frameworks yet. Add one to map {BRAND.name}&rsquo;s controls to it.</p>
      ) : (
        <div className="mt-6 space-y-5">
          {frameworks.map((fw) => (
            <FrameworkCard key={fw.id} fw={fw} mappings={mappings.filter((m) => m.framework_id === fw.id)} pillars={pillars} onChange={() => router.refresh()} />
          ))}
        </div>
      )}
    </div>
  );
}

function FrameworkCard({
  fw, mappings, pillars, onChange,
}: {
  fw: OrgFramework; mappings: FrameworkMapping[]; pillars: { pillar: number; name: string }[]; onChange: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [catalog, setCatalog] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [editOwner, setEditOwner] = useState(false);
  const [ownerVal, setOwnerVal] = useState(fw.authority ?? "");

  async function saveOwner() {
    setBusy("owner");
    const r = await fetch(`/api/frameworks/${fw.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update", authority: ownerVal.trim() }) });
    setBusy(null); setEditOwner(false);
    if (r.ok) onChange();
  }
  // local editable refs per pillar, seeded from saved mappings
  const seeded: Record<number, string> = {};
  for (const m of mappings) if (m.scope === "pillar" && m.pillar != null) seeded[m.pillar] = m.reference;
  const [refs, setRefs] = useState<Record<number, string>>(seeded);
  const statusOf = (p: number) => mappings.find((m) => m.scope === "pillar" && m.pillar === p);

  async function askNeo() {
    setBusy("suggest"); setMsg(null);
    const r = await fetch(`/api/frameworks/${fw.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "suggest", pastedCatalog: catalog.trim() || undefined }) });
    setBusy(null);
    if (r.ok) {
      const j = await r.json().catch(() => ({ proposed: 0 }));
      const n = Number(j.proposed ?? 0);
      const source = String(j.source ?? "");
      const uncovered: number[] = Array.isArray(j.uncovered) ? j.uncovered : [];
      const note = typeof j.note === "string" ? j.note : "";
      if (n > 0) {
        const how =
          source === "generated" ? `${BRAND.name} recalled this framework's controls itself and mapped ` :
          source === "builtin" ? `${BRAND.name} mapped from its built-in catalogue for this standard — ` :
          source === "pasted" ? `${BRAND.name} mapped your pasted control list to ` :
          source === "stored" ? `${BRAND.name} mapped the catalogue on file to ` :
          `${BRAND.name} mapped `;
        const gap = uncovered.length > 0 ? ` ${uncovered.length} of the 10 pillars have no equivalent here — that gap is a real finding.` : "";
        setMsg({ kind: "ok", text: `${how}${n} of 10 pillars — review and confirm below.${gap}` });
      } else {
        setShowPaste(true);
        setMsg({ kind: "err", text: note || `${BRAND.name} couldn't confidently map this one. Paste the control list below and try again.` });
      }
      onChange();
    } else {
      const j = await r.json().catch(() => ({}));
      setMsg({ kind: "err", text: j.error ? String(j.error) : `Mapping failed (${r.status}). Check the ANTHROPIC_API_KEY and your role, or paste the catalogue.` });
    }
  }
  async function saveRow(p: number) {
    const reference = (refs[p] ?? "").trim();
    if (!reference) return;
    setBusy("save" + p);
    const r = await fetch(`/api/frameworks/${fw.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "map", scope: "pillar", pillar: p, reference, status: "confirmed" }) });
    setBusy(null);
    if (r.ok) onChange();
  }
  async function del() {
    if (!confirm(`Delete "${fw.name}" and its mappings?`)) return;
    setBusy("del");
    await fetch(`/api/frameworks/${fw.id}`, { method: "DELETE" });
    onChange();
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
      <div className="flex items-center gap-2">
        <span className="text-[15px] font-bold text-[var(--text)]">{fw.name}</span>
        {editOwner ? (
          <span className="flex items-center gap-1">
            <input autoFocus value={ownerVal} onChange={(e) => setOwnerVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveOwner(); if (e.key === "Escape") { setEditOwner(false); setOwnerVal(fw.authority ?? ""); } }}
              placeholder="owner / authority"
              className="rounded border border-[#0d9488] bg-[var(--surface)] px-1.5 py-0.5 text-[11px] text-[var(--text)] outline-none" />
            <button onClick={saveOwner} disabled={busy === "owner"} className="rounded bg-[#0d9488] px-1.5 py-0.5 text-[10px] font-bold text-white disabled:opacity-40">✓</button>
          </span>
        ) : (
          <button onClick={() => { setEditOwner(true); setOwnerVal(fw.authority ?? ""); }}
            className="group inline-flex items-center gap-1 text-[11px] text-[var(--faint)] hover:text-[var(--text)]" title="Edit owner / authority">
            <span>· {fw.authority || "add owner"}</span>
            <Pencil size={11} className="opacity-0 group-hover:opacity-100" />
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setShowPaste((v) => !v)} className="text-[11.5px] text-[var(--muted)] hover:text-[var(--text)]">Paste catalogue</button>
          <button onClick={askNeo} disabled={busy === "suggest"} className="inline-flex items-center gap-1 rounded-md bg-[#7c3aed] px-2.5 py-1 text-[11.5px] font-semibold text-white disabled:opacity-50">
            <Sparkles size={13} /> {busy === "suggest" ? "Mapping…" : `Ask ${BRAND.name} to map`}
          </button>
          <button onClick={del} disabled={busy === "del"} className="text-[var(--faint)] hover:text-[#ef4444]"><Trash2 size={15} /></button>
        </div>
      </div>

      {showPaste && (
        <textarea value={catalog} onChange={(e) => setCatalog(e.target.value)} rows={4}
          placeholder={`Paste your framework's control list (id + title per line) so ${BRAND.name} maps to your exact references…`}
          className="mt-2 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12px] text-[var(--text)] outline-none focus:border-[#7c3aed]" />
      )}
      {msg && (
        <p className={`mt-2 text-[12px] ${msg.kind === "ok" ? "text-[#22c55e]" : "text-[#f59e0b]"}`}>{msg.text}</p>
      )}

      {/* pillar mapping table */}
      <div className="mt-3 overflow-hidden rounded-lg border border-[var(--border)]">
        <table className="w-full text-left text-[12.5px]">
          <thead className="bg-[var(--surface)] text-[10.5px] uppercase tracking-wide text-[var(--faint)]">
            <tr><th className="px-3 py-2 font-semibold">Pillar</th><th className="px-3 py-2 font-semibold">Your reference</th><th className="w-28 px-3 py-2 font-semibold">Status</th></tr>
          </thead>
          <tbody>
            {pillars.map((p) => {
              const st = statusOf(p.pillar);
              const dirty = (refs[p.pillar] ?? "") !== (seeded[p.pillar] ?? "");
              return (
                <tr key={p.pillar} className="border-t border-[var(--border)] bg-[var(--panel)]">
                  <td className="px-3 py-2 text-[var(--text)]">{p.pillar}. {p.name}</td>
                  <td className="px-3 py-1.5">
                    <input value={refs[p.pillar] ?? ""} onChange={(e) => setRefs((r) => ({ ...r, [p.pillar]: e.target.value }))}
                      placeholder="—"
                      className="w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-[12.5px] text-[var(--text)] outline-none hover:border-[var(--border)] focus:border-[#0d9488]" />
                  </td>
                  <td className="px-3 py-1.5">
                    {dirty || (st && st.status === "suggested") ? (
                      <button onClick={() => saveRow(p.pillar)} disabled={busy === "save" + p.pillar || !(refs[p.pillar] ?? "").trim()}
                        className="inline-flex items-center gap-1 rounded bg-[#0d9488] px-2 py-0.5 text-[10.5px] font-bold text-white disabled:opacity-40">
                        <Check size={11} /> {st?.status === "suggested" && !dirty ? "Confirm" : "Save"}
                      </button>
                    ) : st?.status === "confirmed" ? (
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-[#22c55e]"><Check size={11} /> Confirmed</span>
                    ) : (
                      <span className="text-[10.5px] text-[var(--faint)]">—</span>
                    )}
                    {st?.source === "neo" && st.status === "suggested" && <span className="ml-1 text-[9.5px] text-[#7c3aed]">{BRAND.name}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10.5px] text-[var(--faint)]">
        {BRAND.name}-suggested references are marked <span className="text-[#7c3aed]">{BRAND.name}</span> and stay unconfirmed until you accept them. Pillar mappings apply to every control in that pillar.
      </p>
    </div>
  );
}
