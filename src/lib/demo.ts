import "server-only";
import { supabaseAdmin } from "@/lib/supabase";

/** The internal id of the fictional demo org (is_demo = true), or null. READ ONLY. */
export async function resolveDemoOrgId(): Promise<string | null> {
  const { data } = await supabaseAdmin()
    .from("organizations").select("id").eq("is_demo", true)
    .order("created_at", { ascending: true }).limit(1).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/** Public demo data loader — READ ONLY, fictional demo org only.
 *  Resolves the demo organization (is_demo = true) via the service-role client and returns
 *  the portfolio shape the /demo page needs. No Clerk session, no writes, no real-org data. */
export async function loadDemoDashboard(): Promise<
  { orgName: string; useCases: { id: string; name: string; tier: number | null }[]; controls: { pillar: number; status: string }[] } | null
> {
  const sb = supabaseAdmin();
  const { data: org } = await sb
    .from("organizations")
    .select("id, name")
    .eq("is_demo", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!org) return null;

  const [{ data: useCases }, { data: controls }] = await Promise.all([
    sb.from("use_cases").select("id, name, tier").eq("org_id", org.id).neq("status", "archived"),
    sb.from("control_items").select("pillar, status").eq("org_id", org.id),
  ]);

  return {
    orgName: (org.name as string) ?? "Demo",
    useCases: (useCases ?? []) as { id: string; name: string; tier: number | null }[],
    controls: (controls ?? []) as { pillar: number; status: string }[],
  };
}
