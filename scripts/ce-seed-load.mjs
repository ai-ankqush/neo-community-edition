#!/usr/bin/env node
/**
 * Load the anonymised sample data into a fresh CE database.
 *   DATABASE_URL=postgres://... node scripts/ce-seed-load.mjs
 * Applies supabase/ce-seed.sql (safe: it uses ON CONFLICT DO NOTHING).
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEED = join(ROOT, "supabase", "ce-seed.sql");
if (!existsSync(SEED)) { console.error("No supabase/ce-seed.sql to load."); process.exit(0); }
const url = process.env.DATABASE_URL;
if (!url) { console.error("Set DATABASE_URL"); process.exit(1); }

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(readFileSync(SEED, "utf8"));
  console.log("Sample data loaded.");
} catch (e) {
  console.error("Seed failed:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
