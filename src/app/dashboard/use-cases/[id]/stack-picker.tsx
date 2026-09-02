"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { TECH_CATALOG, CUSTOM_CAPABILITIES, type StackSelection } from "@/lib/tech-catalog";
import { BRAND } from "@/lib/brand";

/** Flat product list for fuzzy "did you mean" matching. */
const ALL_PRODUCTS = TECH_CATALOG.flatMap((c) =>
  c.products.map((p) => ({ category: c.key, catLabel: c.label, name: p.name }))
);

/** Levenshtein distance (small inputs, fine to compute inline). */
function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

/** Closest catalog products to a (possibly misspelled) query. */
function suggest(query: string, limit = 4) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return ALL_PRODUCTS
    .map((p) => {
      const n = p.name.toLowerCase();
      const substr = n.includes(q) || q.includes(n);
      const score = substr ? 0 : lev(q, n) / Math.max(n.length, q.length);
      return { ...p, score };
    })
    .filter((p) => p.score < 0.45)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit);
}

// Categories that are third-party AI — flagged for vendor-risk assessment when declared.
const AI_CATS = new Set(["ai_platform", "agent_framework", "identified"]);

export default function StackPicker({
  useCaseId,
  stack,
  controlsDone,
  productLimit,
  stackAware,
  vendorStatus = {},
}: {
  useCaseId: string;
  stack: StackSelection | null;
  controlsDone: boolean;
  productLimit: number;
  stackAware: boolean;
  vendorStatus?: Record<string, "reviewed" | "self">;
}) {
  const router = useRouter();
  const limit = productLimit < 0 ? Infinity : productLimit;
  const initial: StackSelection = stack?.products ? stack : { products: [], other: "" };
  const captured = initial.products.length > 0;
  const [open, setOpen] = useState(!captured);
  const [sel, setSel] = useState<StackSelection>(initial);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // AI identify
  type Candidate = { vendor: string; product: string; capability: string; confidence: string; note?: string };
  const [idText, setIdText] = useState("");
  const [idBusy, setIdBusy] = useState(false);
  const [idCands, setIdCands] = useState<Candidate[] | null>(null);
  const [idErr, setIdErr] = useState<string | null>(null);

  const capLabel = (k: string) => CUSTOM_CAPABILITIES.find((c) => c.key === k)?.label ?? k;

  async function identify() {
    if (idText.trim().length < 2 || idBusy) return;
    setIdBusy(true);
    setIdErr(null);
    setIdCands(null);
    try {
      const res = await fetch("/api/stack/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: idText, useCaseId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Could not identify");
      setIdCands(json.candidates ?? []);
    } catch (e) {
      setIdErr(e instanceof Error ? e.message : "Could not identify");
    } finally {
      setIdBusy(false);
    }
  }
  function addIdentified(c: Candidate) {
    setSel((s) => {
      if (s.products.some((p) => p.name.toLowerCase() === c.product.toLowerCase())) return s;
      if (s.products.length >= limit) return s;
      return { ...s, products: [...s.products, { category: "identified", name: c.product, services: [], capability: c.capability }] };
    });
  }

  // real-time lookup: identify as the user types (debounced)
  useEffect(() => {
    const t = idText.trim();
    if (t.length < 3) {
      setIdCands(null);
      return;
    }
    const timer = setTimeout(() => identify(), 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idText]);

  const count = sel.products.length;
  const atLimit = count >= limit;
  const searching = search.trim().length > 0;
  const exactMatch = ALL_PRODUCTS.some((p) => p.name.toLowerCase() === search.trim().toLowerCase());

  const isSelected = (category: string, name: string) =>
    sel.products.some((p) => p.category === category && p.name === name);

  function addProduct(category: string, name: string) {
    setSel((s) => {
      if (s.products.some((p) => p.category === category && p.name === name)) return s;
      if (s.products.length >= limit) return s;
      return { ...s, products: [...s.products, { category, name, services: [] }] };
    });
  }
  function removeProduct(category: string, name: string) {
    setSel((s) => ({ ...s, products: s.products.filter((p) => !(p.category === category && p.name === name)) }));
  }
  function addCustom() {
    const name = search.trim();
    if (!name || atLimit) return;
    setSel((s) =>
      s.products.some((p) => p.name.toLowerCase() === name.toLowerCase())
        ? s
        : { ...s, products: [...s.products, { category: "custom", name, services: [] }] }
    );
    setSearch("");
  }
  function toggle(category: string, name: string) {
    isSelected(category, name) ? removeProduct(category, name) : addProduct(category, name);
  }
  function toggleService(category: string, name: string, service: string) {
    setSel((s) => ({
      ...s,
      products: s.products.map((p) => {
        if (p.category !== category || p.name !== name) return p;
        const services = p.services ?? [];
        return { ...p, services: services.includes(service) ? services.filter((x) => x !== service) : [...services, service] };
      }),
    }));
  }
  function setCapability(name: string, capability: string) {
    setSel((s) => ({ ...s, products: s.products.map((p) => (p.category === "custom" && p.name === name ? { ...p, capability } : p)) }));
  }
  function toggleCat(key: string) {
    setExpanded((e) => {
      const next = new Set(e);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const filteredCatalog = useMemo(() => {
    if (!searching) return TECH_CATALOG;
    const q = search.toLowerCase();
    return TECH_CATALOG.map((c) => ({ ...c, products: c.products.filter((p) => p.name.toLowerCase().includes(q)) })).filter((c) => c.products.length > 0);
  }, [search, searching]);

  // "did you mean" — when a search finds nothing, or typed into the free-text box
  const searchSuggestions = useMemo(() => (searching && filteredCatalog.length === 0 ? suggest(search) : []), [searching, filteredCatalog.length, search]);
  const otherSuggestions = useMemo(() => {
    const v = (sel.other ?? "").trim();
    if (v.length < 2) return [];
    return suggest(v).filter((p) => !isSelected(p.category, p.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel.other, sel.products]);

  const catLabel = (key: string) => TECH_CATALOG.find((c) => c.key === key)?.label ?? key;
  const countInCat = (key: string) => sel.products.filter((p) => p.category === key).length;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/use-cases/${useCaseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", stack: sel }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(typeof json.error === "string" ? json.error : "Failed to save");
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  if (!stackAware) {
    return (
      <div className="mb-5 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
        <p className="text-sm font-semibold text-[var(--text)]">Technology Stack</p>
        <p className="mt-1 text-[13px] text-[var(--muted)]">
          The Free plan generates framework-level controls. Upgrade to{" "}
          <Link href="/dashboard/plans" className="text-[#3b82f6] underline">Starter or above</Link>{" "}
          to map controls to your actual stack — Okta policies, CloudTrail settings,
          CrowdStrike configs — as executable engineering steps.
        </p>
      </div>
    );
  }

  const chip = (on: boolean, disabled: boolean) =>
    `rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition disabled:opacity-40 ${
      on ? "border-[#3b82f6] bg-[#3b82f61f] text-[#3b82f6]" : "border-[var(--border)] bg-[var(--panel)] text-[var(--muted)] hover:border-[#3b82f660]"
    }`;

  return (
    <div className="mb-5 rounded-[10px] border border-[var(--border)] bg-[var(--surface)]">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-5 py-3.5 text-left">
        <span className="text-sm font-semibold text-[var(--text)]">
          Technology Stack{" "}
          {captured ? (
            <span className="ml-2 rounded-full border border-[#22c55e40] bg-[#22c55e1f] px-2 py-0.5 text-[10px] font-bold text-[var(--good)]">{initial.products.length} PRODUCTS</span>
          ) : (
            <span className="ml-2 rounded-full border border-[#f59e0b40] bg-[#f59e0b1f] px-2 py-0.5 text-[10px] font-bold text-[#f59e0b]">REQUIRED BEFORE CONTROLS</span>
          )}
        </span>
        <span className="text-[var(--faint)]">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className="border-t border-[var(--border)] p-5">
          {/* AI identify — primary path; works for any product, not just a list */}
          <div className="mb-5 rounded-md border border-[#3b82f640] bg-[#3b82f608] p-4">
            <p className="text-[13px] font-semibold text-[var(--text)]">Tell {BRAND.name} your stack</p>
            <p className="mb-2.5 text-[11px] text-[var(--faint)]">Type any product or vendor — even ones not in any list, or describe an internal tool. {BRAND.name} finds it as you type; confirm the right one so controls map correctly.</p>
            <div className="relative">
              <input
                value={idText}
                onChange={(e) => setIdText(e.target.value)}
                placeholder="Start typing… e.g. CrowdStrike, Okta, our internal ticketing tool, Tanium"
                className="w-full rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 pr-16 text-[13px] text-[var(--text)] outline-none focus:border-[#3b82f6]"
              />
              <span className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-2">
                {idBusy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#3b82f6] border-t-transparent" />}
                {idText && (
                  <button onClick={() => { setIdText(""); setIdCands(null); setIdErr(null); }} className="text-[14px] text-[var(--faint)] hover:text-[var(--text)]" title="Clear" aria-label="Clear">✕</button>
                )}
              </span>
            </div>
            {idErr && <p className="mt-2 text-[12px] text-red-500">{idErr}</p>}
            {idCands && idCands.length === 0 && (
              <p className="mt-2 text-[12px] text-[var(--faint)]">Nothing recognized — try a product or vendor name, or add it as custom below.</p>
            )}
            {idCands && idCands.length > 0 && (
              <div className="mt-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-[11px] font-semibold text-[var(--muted)]">Pick the ones you use:</p>
                  <button onClick={() => setIdCands(null)} className="text-[11px] text-[var(--faint)] hover:text-[var(--text)]" title="Dismiss suggestions">Dismiss ✕</button>
                </div>
                <div className="flex flex-col gap-1.5">
                  {idCands.map((c, i) => {
                    const added = sel.products.some((p) => p.name.toLowerCase() === c.product.toLowerCase());
                    return (
                      <button
                        key={i}
                        onClick={() => addIdentified(c)}
                        disabled={added || (atLimit && !added)}
                        className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-left hover:border-[#3b82f660] disabled:opacity-50"
                      >
                        <span className="text-[12.5px] font-semibold text-[var(--text)]">{c.product}</span>
                        <span className="text-[10px] text-[var(--faint)]">{c.vendor}</span>
                        <span className="rounded bg-[#3b82f61f] px-1.5 py-0.5 text-[10px] font-bold text-[#3b82f6]">{capLabel(c.capability)}</span>
                        {c.confidence === "low" && <span className="rounded bg-[#f59e0b1f] px-1.5 py-0.5 text-[10px] font-bold text-[#f59e0b]">guess</span>}
                        {c.note && <span className="text-[11px] text-[var(--faint)]">— {c.note}</span>}
                        <span className="ml-auto text-[12px] font-semibold text-[#3b82f6]">{added ? "✓ Added" : "+ Add"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--faint)]">Or browse common tools</p>
          {/* search + count */}
          <div className="mb-3 flex items-center justify-between gap-4">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products (Okta, CrowdStrike, Splunk…)"
              className="flex-1 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[#3b82f6]"
            />
            <span className={`shrink-0 text-[13px] font-semibold ${atLimit ? "text-[#f59e0b]" : "text-[var(--muted)]"}`}>
              {count} / {limit === Infinity ? "∞" : limit}
            </span>
          </div>

          {/* add a product that's not in the catalog */}
          {searching && !exactMatch && (
            <button
              onClick={addCustom}
              disabled={atLimit}
              className="mb-3 w-full rounded-md border border-dashed border-[#3b82f680] bg-[#3b82f60a] px-3 py-2 text-left text-[12.5px] font-medium text-[#3b82f6] hover:bg-[#3b82f614] disabled:opacity-40"
            >
              + Add &ldquo;{search.trim()}&rdquo; as a custom product
            </button>
          )}

          {/* did-you-mean when search finds nothing */}
          {searchSuggestions.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-[#f59e0b40] bg-[#f59e0b0f] px-3 py-2">
              <span className="text-[12px] text-[var(--muted)]">Did you mean</span>
              {searchSuggestions.map((p) => (
                <button key={p.category + p.name} onClick={() => { addProduct(p.category, p.name); setSearch(""); }} className="rounded-full border border-[#3b82f6] bg-[#3b82f61f] px-2.5 py-1 text-[12px] font-medium text-[#3b82f6]">
                  {p.name} <span className="text-[10px] text-[var(--faint)]">{p.catLabel}</span>
                </button>
              ))}
            </div>
          )}

          {/* selected summary — always visible */}
          {count > 0 && (
            <div className="mb-4 rounded-md border border-[var(--border)] bg-[var(--panel)] p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--faint)]">Your stack ({count})</p>
              <div className="flex flex-wrap gap-1.5">
                {sel.products.map((p) => (
                  <button key={p.category + p.name} onClick={() => removeProduct(p.category, p.name)} className="group flex items-center gap-1.5 rounded-full border border-[#3b82f6] bg-[#3b82f61f] px-2.5 py-1 text-[12px] font-medium text-[#3b82f6]" title="Remove">
                    {p.name}
                    {p.category === "custom" && <span className="rounded bg-[#f59e0b1f] px-1 text-[9px] font-bold uppercase text-[#f59e0b]">custom</span>}
                    <span className="text-[var(--faint)] group-hover:text-[#ef4444]">✕</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* custom products need a capability so controls map to the right domain */}
          {sel.products.some((p) => p.category === "custom") && (
            <div className="mb-4 rounded-md border border-[#f59e0b40] bg-[#f59e0b0a] p-3">
              <p className="text-[11px] font-semibold text-[var(--text)]">Custom products — tell {BRAND.name} what each one does</p>
              <p className="mb-2.5 text-[11px] text-[var(--faint)]">It&apos;s not in our catalog, so pick the capability — that&apos;s how controls map to the right pillars.</p>
              <div className="flex flex-col gap-2">
                {sel.products.filter((p) => p.category === "custom").map((p) => (
                  <div key={p.name} className="flex items-center gap-2">
                    <span className="min-w-[110px] shrink-0 text-[12.5px] font-medium text-[var(--text)]">{p.name}</span>
                    <select
                      value={p.capability ?? ""}
                      onChange={(e) => setCapability(p.name, e.target.value)}
                      className={`flex-1 rounded-md border bg-[var(--panel)] px-2 py-1.5 text-[12px] text-[var(--text)] outline-none ${p.capability ? "border-[var(--border)]" : "border-[#f59e0b80]"}`}
                    >
                      <option value="">⚠ Select capability…</option>
                      {CUSTOM_CAPABILITIES.map((c) => (
                        <option key={c.key} value={c.key}>{c.label}</option>
                      ))}
                    </select>
                    <button onClick={() => removeProduct("custom", p.name)} className="shrink-0 text-[var(--faint)] hover:text-[#ef4444]" title="Remove">✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI in the stack → flag third-party AI vendor risk (not assessed / self-attested / reviewed) */}
          {sel.products.some((p) => AI_CATS.has(p.category)) && (
            <div className="mb-4 rounded-md border border-[#f59e0b40] bg-[#f59e0b0a] p-3">
              <p className="text-[11px] font-semibold text-[var(--text)]">AI in your stack — vendor risk</p>
              <p className="mb-2.5 text-[11px] text-[var(--faint)]">Third-party AI carries its own risk. Assess each one — send a review to the vendor, or answer for it yourself. Status feeds your AI Supply Chain and the decision.</p>
              <div className="flex flex-col gap-2">
                {sel.products.filter((p) => AI_CATS.has(p.category)).map((p) => {
                  const st = vendorStatus[p.name.toLowerCase().trim()];
                  return (
                    <div key={p.category + p.name} className="flex items-center gap-2">
                      <span className="min-w-[120px] shrink-0 text-[12.5px] font-medium text-[var(--text)]">{p.name}</span>
                      {st === "reviewed" ? (
                        <span className="rounded px-2 py-0.5 text-[11px] font-bold" style={{ color: "#22c55e", background: "#22c55e1a" }}>Vendor-reviewed</span>
                      ) : st === "self" ? (
                        <span className="rounded px-2 py-0.5 text-[11px] font-bold" style={{ color: "#f59e0b", background: "#f59e0b1a" }}>Self-attested</span>
                      ) : (
                        <span className="rounded px-2 py-0.5 text-[11px] font-bold" style={{ color: "#f97316", background: "#f973161a" }}>Not assessed</span>
                      )}
                      {st !== "reviewed" && (
                        <Link href={`/dashboard/vendor-reviews/new?product=${encodeURIComponent(p.name)}`} className="ml-auto text-[11.5px] font-semibold text-[#3b82f6] hover:underline">
                          {st === "self" ? "Run full review →" : "Assess →"}
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {atLimit && limit !== Infinity && (
            <p className="mb-3 text-xs text-[#f59e0b]">Plan limit reached — deselect a product or <Link href="/dashboard/plans" className="underline">upgrade for unlimited stack mapping</Link>.</p>
          )}

          {/* catalog: flat when searching, collapsible categories otherwise */}
          <div className="space-y-2">
            {filteredCatalog.map((cat) => {
              const isOpen = searching || expanded.has(cat.key);
              const nSel = countInCat(cat.key);
              return (
                <div key={cat.key} className="rounded-md border border-[var(--border)]">
                  {!searching && (
                    <button onClick={() => toggleCat(cat.key)} className="flex w-full items-center justify-between px-3 py-2.5 text-left">
                      <span className="text-[12px] font-bold uppercase tracking-wide text-[var(--muted)]">
                        {cat.label}
                        {nSel > 0 && <span className="ml-2 rounded-full bg-[#3b82f61f] px-1.5 py-0.5 text-[10px] font-bold text-[#3b82f6]">{nSel}</span>}
                      </span>
                      <span className="text-[var(--faint)]">{isOpen ? "▴" : "▾"}</span>
                    </button>
                  )}
                  {isOpen && (
                    <div className={`px-3 pb-3 ${searching ? "pt-3" : ""}`}>
                      {searching && <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--faint)]">{cat.label}</p>}
                      <div className="flex flex-wrap gap-2">
                        {cat.products.map((p) => {
                          const on = isSelected(cat.key, p.name);
                          return (
                            <button key={p.name} onClick={() => toggle(cat.key, p.name)} disabled={!on && atLimit} className={chip(on, !on && atLimit)}>
                              {on ? "✓ " : ""}{p.name}
                            </button>
                          );
                        })}
                      </div>
                      {cat.products
                        .filter((p) => p.services && isSelected(cat.key, p.name))
                        .map((p) => {
                          const selected = sel.products.find((x) => x.category === cat.key && x.name === p.name);
                          return (
                            <div key={p.name} className="ml-1 mt-2 rounded-md border border-[#3b82f640] bg-[#3b82f60a] p-3">
                              <p className="text-[11px] font-semibold text-[var(--text)]">Which {p.name} capabilities are you using?</p>
                              <p className="mb-2 text-[11px] text-[var(--faint)]">Controls map to what you pick here — so this can&apos;t be wrong. Doesn&apos;t count toward the limit.</p>
                              {(selected?.services ?? []).length === 0 && (
                                <p className="mb-2 text-[11px] font-medium text-[#f59e0b]">⚠ Pick at least one so controls map to the right capability (e.g. CrowdStrike endpoint vs identity).</p>
                              )}
                              <div className="flex flex-wrap gap-1.5">
                                {p.services!.map((s) => {
                                  const son = selected?.services?.includes(s);
                                  return (
                                    <button key={s} onClick={() => toggleService(cat.key, p.name, s)} className={`rounded border px-2 py-1 text-[11px] ${son ? "border-[#22c55e60] bg-[#22c55e14] text-[var(--good)]" : "border-[var(--border)] text-[var(--faint)] hover:border-[#22c55e40]"}`}>
                                      {son ? "✓ " : ""}{s}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              );
            })}
            {searching && filteredCatalog.length === 0 && searchSuggestions.length === 0 && (
              <p className="text-[12px] text-[var(--faint)]">No matches. Add it in the free-text box below.</p>
            )}
          </div>

          {/* free text + did-you-mean correction */}
          <div className="mt-5">
            <label className="mb-1 block text-xs font-semibold text-[var(--muted)]">Anything else? (free text)</label>
            <input
              value={sel.other ?? ""}
              onChange={(e) => setSel((s) => ({ ...s, other: e.target.value }))}
              placeholder="Internal tools, niche products, versions…"
              className="w-full rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[#3b82f6]"
            />
            {otherSuggestions.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-[12px] text-[var(--muted)]">Did you mean</span>
                {otherSuggestions.map((p) => (
                  <button key={p.category + p.name} onClick={() => { addProduct(p.category, p.name); setSel((s) => ({ ...s, other: "" })); }} className="rounded-full border border-[#3b82f6] bg-[#3b82f61f] px-2.5 py-1 text-[12px] font-medium text-[#3b82f6]">
                    {p.name} <span className="text-[10px] text-[var(--faint)]">{p.catLabel}</span>
                  </button>
                ))}
                <span className="text-[11px] text-[var(--faint)]">— picking one maps it to a known product</span>
              </div>
            )}
          </div>

          {controlsDone && <p className="mt-3 text-xs text-[#f59e0b]">Controls were generated against the previous stack — after saving, rewind to the Controls stage to regenerate the mapping.</p>}
          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
          <button onClick={save} disabled={busy || count === 0} className="mt-4 rounded-md bg-[#3b82f6] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Saving…" : `Save stack (${count} product${count === 1 ? "" : "s"})`}
          </button>
        </div>
      )}
    </div>
  );
}
