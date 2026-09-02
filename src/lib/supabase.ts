import "server-only";
import { createPgClient } from "@/ce/pg-client";

// Community Edition runs on plain Postgres via a pg-backed shim that implements the
// supabase-js query-builder subset the app uses. `supabaseAdmin()` keeps the same
// call surface, so the ~500 existing call sites are unchanged.
export function supabaseAdmin() {
  return createPgClient();
}

/** Org-scoped table accessor — the only approved way to touch tenant data. */
export function orgTable(orgId: string, table: string) {
  return {
    select: (cols = "*") => supabaseAdmin().from(table).select(cols).eq("org_id", orgId),
    insert: (row: Record<string, unknown>) => supabaseAdmin().from(table).insert({ ...row, org_id: orgId }).select(),
    update: (id: string, patch: Record<string, unknown>) =>
      supabaseAdmin().from(table).update(patch).eq("org_id", orgId).eq("id", id).select(),
  };
}
