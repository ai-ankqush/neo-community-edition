import "server-only";
import { supabaseAdmin } from "@/lib/supabase";

export interface LiveResult {
  id: string; battery: string; attack_ref: string | null; title: string;
  owasp_ref: string | null; atlas_ref: string | null;
  verdict: string; severity: string | null; judge_reason: string | null;
  mapped_control: string | null; remediation: string | null;
  transcript: { role: string; text: string }[];
}
export interface LiveRun {
  id: string; use_case_id: string | null; target_method: string; target_label: string | null;
  status: string; selection_reason: string | null; batteries: string[];
  attempted: number; confirmed: number; blocked: number; inconclusive: number;
  started_at: string | null; finished_at: string | null; created_at: string;
}

const j = <T,>(v: unknown, fb: T): T => { try { return typeof v === "string" ? JSON.parse(v) : (v as T) ?? fb; } catch { return fb; } };

export async function loadRun(orgId: string, runId: string): Promise<{ run: LiveRun | null; results: LiveResult[] }> {
  const sb = supabaseAdmin();
  const { data: run } = await sb.from("red_team_runs").select("*").eq("org_id", orgId).eq("id", runId).maybeSingle();
  if (!run) return { run: null, results: [] };
  const { data: results } = await sb.from("red_team_results").select("*").eq("run_id", runId).order("created_at", { ascending: true });
  return {
    run: { ...run, batteries: j<string[]>(run.batteries, []) } as LiveRun,
    results: (results ?? []).map((r) => ({ ...r, transcript: j<{ role: string; text: string }[]>(r.transcript, []) })) as LiveResult[],
  };
}

/** Latest complete run for a use case — for the Findings empirical stamps. */
export async function loadLatestRun(orgId: string, useCaseId: string): Promise<{ run: LiveRun | null; results: LiveResult[]; byOwasp: Record<string, string> }> {
  const sb = supabaseAdmin();
  const { data: run } = await sb.from("red_team_runs")
    .select("*").eq("org_id", orgId).eq("use_case_id", useCaseId).eq("status", "complete")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!run) return { run: null, results: [], byOwasp: {} };
  const { data: results } = await sb.from("red_team_results").select("*").eq("run_id", run.id).order("created_at", { ascending: true });
  const rows = (results ?? []).map((r) => ({ ...r, transcript: j<{ role: string; text: string }[]>(r.transcript, []) })) as LiveResult[];
  // best (worst) verdict per OWASP ref: confirmed > inconclusive > blocked
  const rank: Record<string, number> = { confirmed: 3, inconclusive: 2, blocked: 1 };
  const byOwasp: Record<string, string> = {};
  for (const r of rows) {
    const k = r.owasp_ref ?? r.battery;
    if (!byOwasp[k] || (rank[r.verdict] ?? 0) > (rank[byOwasp[k]] ?? 0)) byOwasp[k] = r.verdict;
  }
  return { run: { ...run, batteries: j<string[]>(run.batteries, []) } as LiveRun, results: rows, byOwasp };
}

/** Recent runs across the org — for the Live Fire console history. */
export async function loadRecentRuns(orgId: string, limit = 20): Promise<LiveRun[]> {
  const sb = supabaseAdmin();
  const { data } = await sb.from("red_team_runs").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(limit);
  return (data ?? []).map((r) => ({ ...r, batteries: j<string[]>(r.batteries, []) })) as LiveRun[];
}
