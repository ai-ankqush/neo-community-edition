import "server-only";
import { runStage } from "@/server/engine/engine";
import { buildAuthorityGraph, type AuthorityGraph } from "@/lib/ai-authority-graph";
import { buildRedTeam, type RedTeamPath } from "@/lib/red-team-v2";

export interface ScanResult {
  name: string;
  graph: AuthorityGraph;
  paths: RedTeamPath[];
  summary: { total: number; open: number; topPathId: string | null };
}

/**
 * "Red Team first" cold-open scan. One sentence in → the REAL methodology
 * classification (one-shot) → authority graph → Red Team with NO controls, so
 * every path is unmitigated. That is both the honest pre-assessment picture and
 * the maximum-scare picture: "here's how this breaks, and nothing's stopping it."
 *
 * Indicative only. The assessment is what turns "likely exposure" into
 * "mapped and closable" — this scan never claims anything is verified.
 */
export async function runScan(text: string, name?: string): Promise<ScanResult> {
  const ucName = (name?.trim() || "Your AI").slice(0, 120);

  // one real classify call (see / decide / do / patterns / autonomy)
  const cls = await runStage("classify", { name: ucName, description: text }, []);
  const classify = cls.draft as never;

  const ucInput = { id: "scan", name: ucName, tier: null as number | null, stack: null as never, classify };
  const graph = buildAuthorityGraph(ucInput as never, {});
  // empty controls → nothing verified → every applicable path stays open (the scare, honestly)
  const paths = buildRedTeam(ucInput as never, graph, []);

  const open = paths.filter((p) => p.residual?.tone === "open" || p.residual?.tone === "partial").length;
  const rank: Record<string, number> = { critical: 4, high: 3, moderate: 2, low: 1 };
  const top = [...paths].sort((a, b) => (rank[b.impact] ?? 0) - (rank[a.impact] ?? 0))[0] ?? null;

  return { name: ucName, graph, paths, summary: { total: paths.length, open, topPathId: top?.id ?? null } };
}
