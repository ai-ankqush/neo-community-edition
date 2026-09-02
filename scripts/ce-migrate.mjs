#!/usr/bin/env node
/**
 * Community Edition migration runner — plain Postgres, no Supabase CLI.
 *
 *   DATABASE_URL=postgres://user:pass@host:5432/db node scripts/ce-migrate.mjs
 *
 * - Ensures the roles the Supabase-authored migrations reference (anon, authenticated,
 *   service_role) exist, plus the pgcrypto extension.
 * - Applies supabase/migrations/*.sql in filename order, once each, tracked in
 *   _ce_migrations. Safe to re-run.
 *
 * Connect as a role that OWNS the schema (the user in DATABASE_URL creates the tables,
 * so it owns them and bypasses the RLS policies — CE uses service-role semantics).
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIG_DIR = join(ROOT, "supabase", "migrations");

const url = process.env.DATABASE_URL;
if (!url) { console.error("Set DATABASE_URL"); process.exit(1); }

const PRELUDE = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create extension if not exists pgcrypto;
create table if not exists _ce_migrations (name text primary key, applied_at timestamptz not null default now());
`;

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(PRELUDE);
  const done = new Set((await client.query("select name from _ce_migrations")).rows.map((r) => r.name));
  const files = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).sort();
  let applied = 0;
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = readFileSync(join(MIG_DIR, f), "utf8");
    process.stdout.write(`applying ${f} ... `);
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into _ce_migrations (name) values ($1)", [f]);
      await client.query("commit");
      console.log("ok");
      applied++;
    } catch (e) {
      await client.query("rollback");
      console.error(`FAILED\n  ${e.message}`);
      process.exit(1);
    }
  }
  console.log(applied ? `\nDone — ${applied} migration(s) applied.` : "\nUp to date — nothing to apply.");
} finally {
  await client.end();
}
