"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { STAGE_LABELS, type Stage } from "@/lib/types/stages";
import { CLERK_ACTIVE } from "@/ce/auth-ui";

interface Job {
  id: string;
  use_case_id: string | null;
  vendor_review_id: string | null;
  use_case_name: string | null;
  stage: string;
  status: string;
  error: string | null;
  read: boolean;
  created_at: string;
}

export default function NotificationsBell() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [unread, setUnread] = useState(0);
  const [gradReady, setGradReady] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function refresh() {
    try {
      const [res, grad] = await Promise.all([
        fetch("/api/jobs", { cache: "no-store" }),
        // AI Action Fabric graduation is Neo Control only — skip the poll in Community Edition.
        CLERK_ACTIVE ? fetch("/api/action-control/graduation", { cache: "no-store" }).catch(() => null) : Promise.resolve(null),
      ]);
      if (res.ok) {
        const json = await res.json();
        setJobs(json.jobs ?? []);
        setUnread(json.unread ?? 0);
      }
      if (grad && grad.ok) {
        const gj = await grad.json();
        setGradReady(gj.ready ?? 0);
      }
    } catch {
      /* network blip - next poll catches up */
    }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function openJob(job: Job) {
    setOpen(false);
    if (!job.read) {
      fetch(`/api/jobs/${job.id}`, { method: "PATCH" }).then(refresh);
    }
    if (job.stage === "artifacts") {
      // code generation lives on Build & Deploy, not the use-case page
      router.push("/dashboard/implementation");
      router.refresh();
    } else if (job.vendor_review_id) {
      router.push(`/dashboard/vendor-reviews/${job.vendor_review_id}`);
      router.refresh();
    } else if (job.use_case_id) {
      router.push(`/dashboard/use-cases/${job.use_case_id}`);
      router.refresh();
    }
  }

  const jobTitle = (j: Job) => {
    const state = j.status === "running" || j.status === "queued" ? "running…" : j.status === "done" ? "ready" : "failed";
    if (j.stage === "vendor_eval") return `Vendor evaluation ${state}`;
    if (j.stage === "vendor_score") return `Vendor re-assessment ${state}`;
    if (j.stage === "vendor_submitted") return "Vendor responses received";
    if (j.stage === "artifacts") return `Code generation ${state}`;
    return `${STAGE_LABELS[j.stage as Stage] ?? j.stage} draft ${j.status === "running" ? "generating..." : j.status === "done" ? "ready" : "failed"}`;
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-md p-2 text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--text)]"
        title="Notifications"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread + (gradReady > 0 ? 1 : 0) > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ef4444] px-1 text-[10px] font-bold text-white">
            {unread + (gradReady > 0 ? 1 : 0)}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-96 rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-xl">
          <div className="border-b border-[var(--border)] px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-[var(--muted)]">
            Engine activity
          </div>
          <div className="max-h-96 overflow-auto">
            {gradReady > 0 && (
              <button
                onClick={() => { setOpen(false); router.push("/dashboard/settings?tab=ai-action-fabric"); router.refresh(); }}
                className="flex w-full items-start gap-3 border-b border-[var(--surface-2)] bg-[#22c55e0a] px-4 py-3 text-left hover:bg-[var(--panel-hover)]"
              >
                <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: "#22c55e" }} />
                <span className="flex-1">
                  <span className="block text-[13px] text-[var(--text)]">
                    {gradReady} control{gradReady === 1 ? "" : "s"} ready to graduate
                  </span>
                  <span className="block text-xs text-[var(--faint)]">Review in Settings › AI Action Fabric</span>
                </span>
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#22c55e]" />
              </button>
            )}
            {jobs.length === 0 && gradReady === 0 && (
              <p className="px-4 py-6 text-center text-sm text-[var(--faint)]">No activity yet.</p>
            )}
            {jobs.map((j) => (
              <button
                key={j.id}
                onClick={() => openJob(j)}
                className={`flex w-full items-start gap-3 border-b border-[var(--surface-2)] px-4 py-3 text-left hover:bg-[var(--panel-hover)] ${
                  !j.read && j.status !== "running" ? "bg-[#3b82f60a]" : ""
                }`}
              >
                <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{
                    background:
                      j.status === "running" ? "#3b82f6" : j.status === "done" ? "#22c55e" : "#ef4444",
                  }}
                />
                <span className="flex-1">
                  <span className="block text-[13px] text-[var(--text)]">
                    {jobTitle(j)}
                  </span>
                  <span className="block text-xs text-[var(--faint)]">
                    {j.use_case_name ?? (j.vendor_review_id ? "Vendor review" : "Use case")}
                    {j.error ? ` - ${j.error.slice(0, 80)}` : ""}
                  </span>
                </span>
                {!j.read && j.status !== "running" && (
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#3b82f6]" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
