import "server-only";
import { supabaseAdmin } from "@/lib/supabase";

/** Ask Neo history — a user's own recents, and the org's anonymized most-asked.
 *  All reads are defensive: a not-yet-applied migration never breaks Ask Neo. */

const norm = (q: string) => q.trim().toLowerCase().replace(/\s+/g, " ");

export async function recordQuery(orgId: string, userId: string, question: string, mode: string): Promise<void> {
  try {
    await supabaseAdmin().from("ask_neo_queries").insert({ org_id: orgId, user_id: userId, question: question.slice(0, 500), mode });
  } catch (e) {
    console.error("ask-neo recordQuery failed", e);
  }
}

/** This user's recent distinct questions (most recent first). */
export async function getMine(orgId: string, userId: string, limit = 8): Promise<string[]> {
  try {
    const { data } = await supabaseAdmin().from("ask_neo_queries").select("question")
      .eq("org_id", orgId).eq("user_id", userId).order("created_at", { ascending: false }).limit(40);
    const seen = new Set<string>(); const out: string[] = [];
    for (const r of (data as { question: string }[] | null) ?? []) {
      const k = norm(r.question);
      if (!seen.has(k)) { seen.add(k); out.push(r.question); }
      if (out.length >= limit) break;
    }
    return out;
  } catch { return []; }
}

/** Anonymized org most-asked — grouped by normalized text, ranked by count. */
export async function getTop(orgId: string, limit = 6): Promise<{ question: string; count: number }[]> {
  try {
    const { data } = await supabaseAdmin().from("ask_neo_queries").select("question")
      .eq("org_id", orgId).order("created_at", { ascending: false }).limit(500);
    const m = new Map<string, { question: string; count: number }>();
    for (const r of (data as { question: string }[] | null) ?? []) {
      const k = norm(r.question);
      const e = m.get(k);
      if (e) e.count++; else m.set(k, { question: r.question, count: 1 });
    }
    return [...m.values()].sort((a, b) => b.count - a.count).slice(0, limit);
  } catch { return []; }
}

export async function clearMine(orgId: string, userId: string): Promise<void> {
  try {
    await supabaseAdmin().from("ask_neo_queries").delete().eq("org_id", orgId).eq("user_id", userId);
  } catch (e) {
    console.error("ask-neo clearMine failed", e);
  }
}
