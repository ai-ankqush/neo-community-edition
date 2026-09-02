"use client";

import { useState } from "react";
import type { AiBom } from "@/lib/ai-bom-generate";
import { BRAND } from "@/lib/brand";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export default function UseCaseAiBom({ bom, useCaseName }: { bom: AiBom; useCaseName: string }) {
  const [open, setOpen] = useState(false);
  const comps = bom.components ?? [];
  const models = comps.filter((c) => c.type === "machine-learning-model");
  const frameworks = comps.filter((c) => c.type === "framework");
  const data = comps.filter((c) => c.type === "data");
  const libs = comps.filter((c) => c.type === "library");
  const name = (c: Record<string, unknown>) => String(c.name ?? "");

  function download() {
    const blob = new Blob([JSON.stringify(bom, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ai-bom-${slug(useCaseName) || "use-case"}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const Section = ({ label, items, color }: { label: string; items: Record<string, unknown>[]; color: string }) =>
    items.length === 0 ? null : (
      <div>
        <p className="mb-1 text-[11px] font-bold uppercase tracking-wide" style={{ color }}>{label} · {items.length}</p>
        <div className="flex flex-wrap gap-1.5">
          {items.map((c, i) => (
            <span key={i} className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-[12px] text-[var(--text)]">{name(c)}</span>
          ))}
        </div>
      </div>
    );

  return (
    <div className="mb-5 rounded-[10px] border border-[var(--border)] bg-[var(--surface)]">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-5 py-3.5 text-left">
        <span className="text-sm font-semibold text-[var(--text)]">
          AI-BOM
          <span className="ml-2 rounded-full border border-[#3b82f640] bg-[#3b82f61f] px-2 py-0.5 text-[10px] font-bold text-[#3b82f6]">{comps.length} COMPONENTS</span>
        </span>
        <span className="text-[var(--faint)]">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className="border-t border-[var(--border)] p-5">
          <div className="flex flex-wrap items-start gap-2">
            <p className="max-w-md text-[12px] text-[var(--faint)]">
              A CycloneDX ML-BOM {BRAND.name} composed from your declared stack and classification — the models, data, and dependencies in this AI.
            </p>
            <button onClick={download} className="ml-auto rounded-md bg-[#3b82f6] px-3.5 py-1.5 text-[12.5px] font-semibold text-white">
              Download CycloneDX ↓
            </button>
          </div>

          {comps.length === 0 ? (
            <p className="mt-3 text-[12.5px] text-[var(--faint)]">Declare your stack and run classification — the AI-BOM fills in from there.</p>
          ) : (
            <div className="mt-3 flex flex-col gap-3">
              <Section label="Models" items={models} color="#3b82f6" />
              <Section label="Data accessed" items={data} color="#22c55e" />
              <Section label="Frameworks" items={frameworks} color="#818cf8" />
              <Section label="Dependencies" items={libs} color="#8892a4" />
            </div>
          )}
          <p className="mt-3 text-[11px] text-[var(--faint)]">
            Download it and commit it to your repo — then the GitHub check verifies it&apos;s present. Generate, then verify.
          </p>
        </div>
      )}
    </div>
  );
}
