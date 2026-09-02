/**
 * Community Edition database client — a small, dependency-light shim that implements
 * the subset of the supabase-js query builder this codebase uses, backed directly by
 * `pg` (node-postgres). It lets CE run on any plain Postgres with NO Supabase account
 * and NO changes to the ~500 call sites, which keep calling `supabaseAdmin().from(...)`.
 *
 * Supported: from · select · insert · update · upsert · delete · eq/neq/gt/gte/lt/lte ·
 * like/ilike · is · in · contains · match · not · or · filter · order · limit · range ·
 * single · maybeSingle · count ({count:'exact', head?}). No RLS (service-role semantics):
 * connect as a role that owns/bypasses the tables.
 *
 * pg is required lazily so this file type-checks and ships without pg present in
 * non-CE builds; it is only imported when AUTH_PROVIDER/edition is community.
 */

type Row = Record<string, unknown>;
type QResult = { rows: Row[]; rowCount: number | null };
export interface Queryable {
  query(text: string, values?: unknown[]): Promise<QResult>;
}
// Public awaited shapes mirror supabase-js (untyped): list queries resolve an ARRAY so
// `(data ?? []).map(...)` type-checks cleanly; single()/maybeSingle() resolve a scalar row.
type Err = { message: string } | null;
/* eslint-disable @typescript-eslint/no-explicit-any */
type Result = { data: any; error: Err; count: number | null; status: number };
type ListResult = { data: any[] | null; error: Err; count: number | null; status: number };
type OneResult = { data: any | null; error: Err; count: number | null; status: number };
/* eslint-enable @typescript-eslint/no-explicit-any */

import { createRequire } from "node:module";
// ESM-safe runtime require: loads pg from node_modules without a static/bundled dependency,
// so this file type-checks and ships even where pg isn't installed (non-CE builds).
const _require = createRequire(import.meta.url);
type PoolCtor = new (cfg: { connectionString?: string; max?: number }) => Queryable;
let _pool: Queryable | null = null;
function defaultPool(): Queryable {
  if (!_pool) {
    const pg = _require("pg") as { Pool: PoolCtor };
    _pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  }
  return _pool;
}

// ---- column-type awareness (cached) so jsonb vs array values serialize correctly ----
const _colCache = new Map<string, Record<string, string>>();
async function udtMap(q: Queryable, table: string): Promise<Record<string, string>> {
  const hit = _colCache.get(table);
  if (hit) return hit;
  const r = await q.query(
    "select column_name, udt_name from information_schema.columns where table_schema = 'public' and table_name = $1",
    [table],
  );
  const m: Record<string, string> = {};
  for (const row of r.rows) m[String(row.column_name)] = String(row.udt_name);
  _colCache.set(table, m);
  return m;
}
function encodeWrite(val: unknown, udt?: string): unknown {
  if (val === null || val === undefined) return null;
  if (udt === "jsonb" || udt === "json") return JSON.stringify(val);
  if (Array.isArray(val)) return udt && udt.startsWith("_") ? val : JSON.stringify(val); // pg array col vs json fallback
  if (typeof val === "object" && !(val instanceof Date)) return JSON.stringify(val);
  return val;
}

const OPS: Record<string, string> = {
  eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=",
  like: "like", ilike: "ilike", cs: "@>", contains: "@>",
};

type Filter =
  | { kind: "cmp"; col: string; op: string; val: unknown; negate?: boolean }
  | { kind: "is"; col: string; val: unknown; negate?: boolean }
  | { kind: "in"; col: string; vals: unknown[]; negate?: boolean }
  | { kind: "raw"; sql: string };

class Builder implements PromiseLike<ListResult> {
  private op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private cols = "*";
  private filters: Filter[] = [];
  private orders: string[] = [];
  private limitN?: number;
  private offsetN?: number;
  private rows: Row[] = [];
  private patch: Row = {};
  private conflict?: string;
  private ignoreDup = false;
  private returning = false;
  private wantCount = false;
  private headOnly = false;
  private one: "single" | "maybe" | null = null;

  constructor(private injected: Queryable | undefined, private table: string) {}
  private pool(): Queryable { return this.injected ?? defaultPool(); }

  select(cols = "*", opts?: { count?: string; head?: boolean }) {
    if (this.op === "select") this.cols = cols || "*";
    this.returning = true;
    if (opts?.count) this.wantCount = true;
    if (opts?.head) { this.headOnly = true; this.returning = false; }
    return this;
  }
  insert(rows: Row | Row[]) { this.op = "insert"; this.rows = Array.isArray(rows) ? rows : [rows]; return this; }
  update(patch: Row) { this.op = "update"; this.patch = patch; return this; }
  upsert(rows: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.op = "upsert"; this.rows = Array.isArray(rows) ? rows : [rows];
    this.conflict = opts?.onConflict; this.ignoreDup = opts?.ignoreDuplicates ?? false; return this;
  }
  delete() { this.op = "delete"; return this; }

  eq(col: string, val: unknown) { this.filters.push({ kind: "cmp", col, op: "eq", val }); return this; }
  neq(col: string, val: unknown) { this.filters.push({ kind: "cmp", col, op: "neq", val }); return this; }
  gt(col: string, val: unknown) { this.filters.push({ kind: "cmp", col, op: "gt", val }); return this; }
  gte(col: string, val: unknown) { this.filters.push({ kind: "cmp", col, op: "gte", val }); return this; }
  lt(col: string, val: unknown) { this.filters.push({ kind: "cmp", col, op: "lt", val }); return this; }
  lte(col: string, val: unknown) { this.filters.push({ kind: "cmp", col, op: "lte", val }); return this; }
  like(col: string, val: unknown) { this.filters.push({ kind: "cmp", col, op: "like", val }); return this; }
  ilike(col: string, val: unknown) { this.filters.push({ kind: "cmp", col, op: "ilike", val }); return this; }
  contains(col: string, val: unknown) { this.filters.push({ kind: "cmp", col, op: "contains", val }); return this; }
  is(col: string, val: unknown) { this.filters.push({ kind: "is", col, val }); return this; }
  in(col: string, vals: unknown[]) { this.filters.push({ kind: "in", col, vals }); return this; }
  match(obj: Row) { for (const [col, val] of Object.entries(obj)) this.filters.push({ kind: "cmp", col, op: "eq", val }); return this; }
  not(col: string, op: string, val: unknown) {
    if (op === "is") this.filters.push({ kind: "is", col, val, negate: true });
    else if (op === "in") this.filters.push({ kind: "in", col, vals: val as unknown[], negate: true });
    else this.filters.push({ kind: "cmp", col, op, val, negate: true });
    return this;
  }
  filter(col: string, op: string, val: unknown) {
    if (op === "is") this.filters.push({ kind: "is", col, val });
    else if (op === "in") this.filters.push({ kind: "in", col, vals: Array.isArray(val) ? val : String(val).replace(/^\(|\)$/g, "").split(",") });
    else this.filters.push({ kind: "cmp", col, op, val });
    return this;
  }
  or(expr: string) {
    // "col.op.val,col.op.val" -> (col OP val OR ...). Params are inlined-safe only for
    // simple scalar values; used sparingly in this codebase.
    const parts = expr.split(",").map((p) => {
      const [col, op, ...rest] = p.split(".");
      const raw = rest.join(".");
      const sqlOp = OPS[op] ?? "=";
      const lit = /^-?\d+(\.\d+)?$/.test(raw) ? raw : `'${raw.replace(/'/g, "''")}'`;
      return `${ident(col)} ${sqlOp} ${lit}`;
    });
    this.filters.push({ kind: "raw", sql: `(${parts.join(" OR ")})` });
    return this;
  }

  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    const dir = opts?.ascending === false ? "desc" : "asc";
    const nulls = opts?.nullsFirst === undefined ? "" : opts.nullsFirst ? " nulls first" : " nulls last";
    this.orders.push(`${ident(col)} ${dir}${nulls}`);
    return this;
  }
  limit(n: number) { this.limitN = n; return this; }
  range(from: number, to: number) { this.offsetN = from; this.limitN = to - from + 1; return this; }
  single(): PromiseLike<OneResult> { this.one = "single"; this.returning = true; return this.asOne(); }
  maybeSingle(): PromiseLike<OneResult> { this.one = "maybe"; this.returning = true; return this.asOne(); }
  private asOne(): PromiseLike<OneResult> {
    return { then: (f, r) => this.run().then(f as never, r as never) };
  }

  private where(values: unknown[]): string {
    if (!this.filters.length) return "";
    const parts = this.filters.map((f) => {
      if (f.kind === "raw") return f.sql;
      if (f.kind === "is") {
        const lit = f.val === null ? "null" : f.val === true ? "true" : f.val === false ? "false" : "null";
        return `${ident(f.col)} is ${f.negate ? "not " : ""}${lit}`;
      }
      if (f.kind === "in") {
        values.push(f.vals);
        return `${f.negate ? "not " : ""}${ident(f.col)} = any($${values.length})`;
      }
      const sqlOp = OPS[f.op] ?? "=";
      values.push(f.val);
      const clause = `${ident(f.col)} ${sqlOp} $${values.length}`;
      return f.negate ? `not (${clause})` : clause;
    });
    return " where " + parts.join(" and ");
  }

  /** Build SQL for the read/count path (mutations build inline in run()). */
  compile(): { text: string; values: unknown[] } {
    const values: unknown[] = [];
    const cols = this.headOnly || this.wantCount ? "count(*)::int as count" : selectCols(this.cols);
    let text = `select ${cols} from ${ident(this.table)}${this.where(values)}`;
    if (!this.headOnly) {
      if (this.orders.length) text += " order by " + this.orders.join(", ");
      if (this.limitN !== undefined) text += ` limit ${Number(this.limitN)}`;
      if (this.offsetN !== undefined) text += ` offset ${Number(this.offsetN)}`;
    }
    return { text, values };
  }

  private async run(): Promise<Result> {
    const q = this.pool();
    try {
      if (this.op === "select") {
        if (this.headOnly) {
          const values: unknown[] = [];
          const text = `select count(*)::int as count from ${ident(this.table)}${this.where(values)}`;
          const r = await q.query(text, values);
          return { data: null, error: null, count: Number(r.rows[0]?.count ?? 0), status: 200 };
        }
        const { text, values } = this.compile();
        const r = await q.query(text, values);
        let count: number | null = null;
        if (this.wantCount) {
          const cv: unknown[] = [];
          const ctext = `select count(*)::int as count from ${ident(this.table)}${this.where(cv)}`;
          count = Number((await q.query(ctext, cv)).rows[0]?.count ?? 0);
        }
        return this.shape(r.rows, count);
      }
      // mutations
      const udts = await udtMap(q, this.table);
      const values: unknown[] = [];
      let text = "";
      if (this.op === "insert" || this.op === "upsert") {
        const colsSet = new Set<string>();
        for (const row of this.rows) for (const k of Object.keys(row)) colsSet.add(k);
        const colList = [...colsSet];
        const tuples = this.rows.map((row) => {
          const ph = colList.map((c) => { values.push(encodeWrite(row[c] ?? null, udts[c])); return `$${values.length}`; });
          return `(${ph.join(", ")})`;
        });
        text = `insert into ${ident(this.table)} (${colList.map(ident).join(", ")}) values ${tuples.join(", ")}`;
        if (this.op === "upsert") {
          const conflictCols = (this.conflict ?? "id").split(",").map((s) => ident(s.trim())).join(", ");
          const setList = colList.filter((c) => !(this.conflict ?? "id").split(",").map((s) => s.trim()).includes(c))
            .map((c) => `${ident(c)} = excluded.${ident(c)}`);
          const doClause = this.ignoreDup || !setList.length ? "nothing" : "update set " + setList.join(", ");
          text += ` on conflict (${conflictCols}) do ${doClause}`;
        }
      } else if (this.op === "update") {
        const sets = Object.keys(this.patch).map((c) => { values.push(encodeWrite(this.patch[c], udts[c])); return `${ident(c)} = $${values.length}`; });
        text = `update ${ident(this.table)} set ${sets.join(", ")}${this.where(values)}`;
      } else { // delete
        text = `delete from ${ident(this.table)}${this.where(values)}`;
      }
      if (this.returning) text += " returning *";
      const r = await q.query(text, values);
      return this.returning ? this.shape(r.rows, null) : { data: null, error: null, count: r.rowCount ?? null, status: 200 };
    } catch (e) {
      // AggregateError (e.g. ECONNREFUSED) has a blank .message — dig out the real cause.
      const err = e as { message?: string; code?: string; errors?: { message?: string; code?: string }[] };
      const msg = (e instanceof Error && e.message)
        || err.errors?.[0]?.message || err.errors?.[0]?.code || err.code
        || String(e) || "database error";
      return { data: null, error: { message: msg }, count: null, status: 400 };
    }
  }

  private shape(rows: Row[], count: number | null): Result {
    if (this.one === "single") {
      if (rows.length !== 1) return { data: null, error: { message: `expected 1 row, got ${rows.length}` }, count, status: 406 };
      return { data: rows[0], error: null, count, status: 200 };
    }
    if (this.one === "maybe") return { data: rows[0] ?? null, error: null, count, status: 200 };
    return { data: rows as unknown as Row, error: null, count, status: 200 };
  }

  then<R1 = ListResult, R2 = never>(
    onfulfilled?: ((value: ListResult) => R1 | PromiseLike<R1>) | undefined | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | undefined | null,
  ): Promise<R1 | R2> {
    return this.run().then(onfulfilled as never, onrejected as never);
  }
}

function ident(name: string): string {
  // simple identifier quoting; allow already-qualified a.b
  return name.split(".").map((p) => (/^[a-z_][a-z0-9_]*$/i.test(p) ? p : `"${p.replace(/"/g, '""')}"`)).join(".");
}
function selectCols(cols: string): string {
  if (!cols || cols === "*") return "*";
  // supabase count-embeds / renames are not used here; take comma-separated plain columns
  return cols.split(",").map((c) => ident(c.trim())).join(", ");
}

export interface PgClient { from(table: string): Builder; }
export function createPgClient(pool?: Queryable): PgClient {
  return { from: (table: string) => new Builder(pool, table) };
}
