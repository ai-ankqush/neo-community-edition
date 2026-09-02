/**
 * Real-Postgres smoke test for the CE pg shim. Run against a throwaway DB:
 *
 *   DATABASE_URL=postgres://... node --experimental-transform-types scripts/ce-db-smoke.ts
 *
 * Exercises the shim end-to-end (create/insert jsonb+array/select/eq/order/count/
 * upsert/update/maybeSingle/delete) against a live Postgres and asserts results.
 * This is the piece the sandbox cannot run — it needs a real database.
 */
import assert from "node:assert";
import { createPgClient } from "../src/ce/pg-client.ts";

const sb = createPgClient(); // uses DATABASE_URL via pg

async function main() {
  // fresh scratch table (jsonb + text[] to exercise write encoding)
  const { Client } = (await import("pg")).default;
  const admin = new Client({ connectionString: process.env.DATABASE_URL });
  await admin.connect();
  await admin.query(`drop table if exists _ce_smoke;
    create table _ce_smoke (
      id uuid primary key default gen_random_uuid(),
      org_id text not null, name text, tier int,
      stack jsonb default '{}'::jsonb, patterns text[] default '{}',
      created_at timestamptz default now());`);
  await admin.end();

  // insert (jsonb object + text[] array) + returning single
  const ins = await sb.from("_ce_smoke")
    .insert({ org_id: "o1", name: "alpha", tier: 4, stack: { vendor: "x" }, patterns: ["a", "b"] })
    .select().single();
  assert.equal(ins.error, null, "insert error: " + JSON.stringify(ins.error));
  assert.equal((ins.data as any).name, "alpha");
  assert.deepEqual((ins.data as any).stack, { vendor: "x" }, "jsonb roundtrip");
  assert.deepEqual((ins.data as any).patterns, ["a", "b"], "text[] roundtrip");

  await sb.from("_ce_smoke").insert({ org_id: "o1", name: "beta", tier: 2 });
  await sb.from("_ce_smoke").insert({ org_id: "o2", name: "gamma", tier: 5 });

  // select + eq + order + limit
  const list = await sb.from("_ce_smoke").select("name, tier").eq("org_id", "o1").order("tier", { ascending: false }).limit(10);
  assert.deepEqual((list.data as any[]).map((r) => r.name), ["alpha", "beta"], "eq+order");

  // count head
  const c = await sb.from("_ce_smoke").select("*", { count: "exact", head: true }).eq("org_id", "o1");
  assert.equal(c.count, 2, "count head");

  // in
  const inq = await sb.from("_ce_smoke").select("name").in("tier", [2, 5]);
  assert.equal((inq.data as any[]).length, 2, "in()");

  // update + eq
  await sb.from("_ce_smoke").update({ tier: 3 }).eq("name", "beta");
  const upd = await sb.from("_ce_smoke").select("tier").eq("name", "beta").maybeSingle();
  assert.equal((upd.data as any).tier, 3, "update");

  // upsert on id conflict
  const row = ins.data as any;
  await sb.from("_ce_smoke").upsert({ id: row.id, org_id: "o1", name: "alpha2", tier: row.tier }, { onConflict: "id" });
  const re = await sb.from("_ce_smoke").select("name").eq("id", row.id).single();
  assert.equal((re.data as any).name, "alpha2", "upsert update");

  // is / not
  const nn = await sb.from("_ce_smoke").select("name").not("name", "is", null);
  assert.ok((nn.data as any[]).length >= 3, "not is null");

  // delete
  await sb.from("_ce_smoke").delete().eq("org_id", "o2");
  const after = await sb.from("_ce_smoke").select("*", { count: "exact", head: true });
  assert.equal(after.count, 2, "delete");

  console.log("✓ pg shim smoke: all assertions passed against real Postgres");
}
main().then(() => process.exit(0)).catch((e) => { console.error("✗ smoke failed:", e.message); process.exit(1); });
