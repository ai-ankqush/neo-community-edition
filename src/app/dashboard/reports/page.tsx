import { portfolioContext } from "@/lib/portfolio";
import { supabaseAdmin } from "@/lib/supabase";
import ExecutiveReports from "./executive-reports";

export const dynamic = "force-dynamic";

/** Executive Reports — a generation surface, not a dashboard. Pick a scope, Neo
 *  opens the printable report → save to PDF. On demand; nothing is stored. */
export default async function ReportsPage() {
  const ctx = await portfolioContext();
  if (!ctx) return <p className="text-[var(--muted)]">Select an organization first.</p>;
  const sb = supabaseAdmin();
  const [{ data: ucs }, { data: vendors }] = await Promise.all([
    sb.from("use_cases").select("id, name").eq("org_id", ctx.internalOrgId).neq("status", "archived").order("updated_at", { ascending: false }),
    sb.from("vendor_reviews").select("id, product_name").eq("org_id", ctx.internalOrgId).neq("status", "archived").order("created_at", { ascending: false }),
  ]);
  return (
    <ExecutiveReports
      useCases={(ucs ?? []).map((u) => ({ id: u.id as string, name: (u.name as string) ?? "Untitled" }))}
      vendors={(vendors ?? []).map((v) => ({ id: v.id as string, name: (v.product_name as string) ?? "Vendor" }))}
    />
  );
}
