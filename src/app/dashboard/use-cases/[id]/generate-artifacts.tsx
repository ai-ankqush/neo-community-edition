"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

const ACTIVITY = [
  "Reading your controls and stack…",
  "Writing Terraform / policy / config per control…",
  "Generating SIEM detection rules…",
  "Mapping every artifact to your declared tools…",
  "Flagging environment-specific TODOs…",
];

export default function GenerateArtifacts({
  useCaseId,
  count,
  activeJobId = null,
}: {
  useCaseId: string;
  count: number;
  activeJobId?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [actIdx, setActIdx] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!busy) return;
    const p = setInterval(() => setPct((v) => (v < 92 ? v + Math.max(1, (92 - v) / 20) : v)), 700);
    const a = setInterval(() => setActIdx((i) => (i + 1) % ACTIVITY.length), 3000);
    return () => { clearInterval(p); clearInterval(a); };
  }, [busy]);

  // Poll a job to completion. Shared by a fresh run() and by resume-on-mount.
  const track = useCallback((jobId: string) => {
    const started = Date.now();
    const poll = async (): Promise<void> => {
      const r = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
      if (!r.ok) throw new Error("Lost track of the job");
      const { job } = await r.json();
      if (job.status === "queued") setNote("Queued — waiting for the worker.");
      else if (job.status === "running") setNote("Generating on the worker…");
      if (job.status === "done") {
        setPct(100); setBusy(false); router.refresh();
      } else if (job.status === "failed") {
        setErr(job.error ?? "Generation failed"); setBusy(false);
      } else if (Date.now() - started > 8 * 60 * 1000) {
        setErr("Still running in the background — the bell will notify you."); setBusy(false);
      } else {
        setTimeout(() => poll().catch(() => setBusy(false)), 3000);
      }
    };
    poll().catch(() => setBusy(false));
  }, [router]);

  // Resume an in-flight generation on mount, so the progress bar survives
  // navigating away from (and back to) the Build & Deploy page.
  useEffect(() => {
    if (!activeJobId) return;
    setBusy(true); setPct((v) => (v > 30 ? v : 30)); setNote("Generating on the worker…");
    track(activeJobId);
  }, [activeJobId, track]);

  async function run() {
    if (busy) return;
    setBusy(true); setErr(null); setNote(null); setPct(6); setActIdx(0);
    try {
      const res = await fetch(`/api/use-cases/${useCaseId}/generate-artifacts`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Could not start");
      track(json.jobId as string);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start"); setBusy(false);
    }
  }

  if (busy) {
    return (
      <div className="w-full md:w-[260px]">
        <div className="flex items-center gap-2">
          <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-[#3b82f6] border-t-transparent" />
          <span className="text-[12px] font-semibold text-[var(--text)]">Generating {Math.round(pct)}%</span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--border)]">
          <div className="h-full rounded-full bg-[#3b82f6] transition-all duration-700 ease-out" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1.5 text-[11px] text-[var(--muted)]">{note ?? ACTIVITY[actIdx]}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end">
      <button
        onClick={run}
        className="rounded-md border border-[#3b82f640] px-3 py-1.5 text-xs font-semibold text-[#3b82f6] hover:bg-[#3b82f614]"
        title="Generate Terraform / policy / config scaffolds per control, mapped to your stack (review before applying)"
      >
        {count > 0 ? "↻ Regenerate code" : "✦ Generate code artifacts"}
      </button>
      {err && <span className="mt-1 max-w-[220px] text-right text-[11px] text-red-500">{err}</span>}
    </div>
  );
}
