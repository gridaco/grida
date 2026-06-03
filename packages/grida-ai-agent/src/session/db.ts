/**
 * Open the SessionsStore's SQLite database.
 *
 * Underlying driver is `node:sqlite` (Node 24 LTS built-in,
 * experimental in 22.x — Grida targets Node 24, so we just use it).
 * Drizzle ORM rides on top via the `sqlite-proxy` adapter: drizzle
 * issues SQL strings, our callback executes them through
 * `DatabaseSync.prepare(...)`.
 *
 * Why sqlite-proxy and not the canonical `drizzle-orm/better-sqlite3`:
 * the latter pulls in `better-sqlite3`'s native module, which would
 * need a native rebuild + a published binary matching every target.
 * `node:sqlite` ships with Node, no rebuild, no extra binary. The
 * trade-off is the proxy adapter's async surface (the underlying calls
 * are sync, but drizzle's typing is async).
 *
 * DB file location: `${userDataPath}/sessions.db`, sibling to
 * `auth.json`. WAL mode for concurrent readers (CLI inspecting the
 * DB while the agent host is running). `busy_timeout=5000` so writes
 * wait briefly when another writer holds the lock; `foreign_keys=ON`
 * so the `ON DELETE CASCADE` declarations actually fire.
 */

import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema";
import { BOOTSTRAP_SQL } from "./schema";

export type SessionsSchema = typeof schema;
export type SessionsDb = SqliteRemoteDatabase<SessionsSchema>;

export type OpenSessionsDbOptions = {
  /** Agent host `userDataPath`. The DB lives at `${userDataPath}/sessions.db`. */
  user_data_path: string;
  /**
   * Override the DB filename. Default `sessions.db`. Tests use ":memory:"
   * with `userDataPath: undefined` is awkward — pass `dbFile` instead.
   */
  db_file?: string;
};

export type OpenedSessionsDb = {
  db: SessionsDb;
  /** Raw `node:sqlite` handle. Smoke / tests reach in for direct SELECTs. */
  sqlite: DatabaseSync;
  /** Schema bag for chainable drizzle queries (`db.select().from(schema.chatSessions)`). */
  schema: SessionsSchema;
  /** Close the underlying sqlite handle. */
  close: () => void;
};

/**
 * Open (or create) the sessions DB and run the idempotent bootstrap.
 *
 * Safe to call multiple times — `CREATE TABLE IF NOT EXISTS` keeps the
 * second open a no-op.
 */
export function openSessionsDb(opts: OpenSessionsDbOptions): OpenedSessionsDb {
  const filePath =
    opts.db_file ?? path.join(opts.user_data_path, "sessions.db");
  // `node:sqlite`'s DatabaseSync does NOT create the parent directory, and the
  // host's userDataPath (e.g. `~/.grida/agent`) may not exist yet on a fresh
  // machine. Create it so the open succeeds — mirrors how the JSON stores
  // self-ensure their dir via `atomicWrite`. (":memory:" has no parent.)
  if (filePath !== ":memory:") {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  const sqlite = new DatabaseSync(filePath);

  sqlite.exec("PRAGMA journal_mode = WAL");
  sqlite.exec("PRAGMA synchronous = NORMAL");
  sqlite.exec("PRAGMA busy_timeout = 5000");
  sqlite.exec("PRAGMA foreign_keys = ON");

  // Idempotent schema bootstrap (`CREATE ... IF NOT EXISTS`). Day-1: no
  // shipped DB to migrate in place — when that changes, switch to
  // versioned migrations (see schema.ts).
  sqlite.exec(BOOTSTRAP_SQL);

  const db = drizzle(
    async (sql, params, method) => execProxy(sqlite, sql, params, method),
    { schema }
  );

  return {
    db,
    sqlite,
    schema,
    close: () => {
      try {
        sqlite.close();
      } catch {
        // already closed
      }
    },
  };
}

type ProxyMethod = "run" | "all" | "values" | "get";

/**
 * Bridge drizzle's async proxy callback to `node:sqlite`'s sync API.
 *
 * `method` semantics (per drizzle's sqlite-proxy):
 *   - 'run': mutation; return value ignored.
 *   - 'all' / 'values': return `rows` as an **array of positional
 *     value arrays** — drizzle's `mapResultRow` indexes by column
 *     position (`row[columnIndex]`), not by name. Returning row
 *     objects causes silent null mapping.
 *   - 'get': return `rows` as a **single positional array** for the
 *     first row (drizzle passes `rows` directly to `mapResultRow`,
 *     not `rows[0]`). When no row matches, return `rows: []` so
 *     drizzle's `!row` check sees the empty array as truthy but
 *     iteration produces nothing — matches its `undefined` path
 *     because `mapResultRow` over an empty positional array yields
 *     `{}`. For our v1 use we always call `.limit(1)`, so the
 *     scenario "no row" is consumed via `await store.get()` which
 *     also defends with an explicit null check, so it's fine.
 *
 * `node:sqlite` produces row objects with null prototypes; we read
 * them via `Object.values()` which preserves column order matching
 * the SELECT projection.
 */
function execProxy(
  sqlite: DatabaseSync,
  sqlString: string,
  params: unknown[],
  method: ProxyMethod
): { rows: unknown[] } {
  const stmt = sqlite.prepare(sqlString);
  const bound = params as Array<string | number | bigint | Buffer | null>;
  if (method === "run") {
    stmt.run(...bound);
    return { rows: [] };
  }
  // node:sqlite supports a per-statement positional/array result mode
  // via `setReadBigInts(false)` (default) + `setReturnArrays(true)` —
  // when available it skips object construction. But the API isn't
  // present on all minor versions, so we fall back to `Object.values`
  // on the row object. Both shapes are positional from drizzle's
  // POV because the column order in the row object matches the SQL
  // projection order (SQLite's documented guarantee).
  const allRows = stmt.all(...bound) as Array<Record<string, unknown>>;
  if (method === "get") {
    const first = allRows[0];
    if (first === undefined) {
      // drizzle's `mapGetResult` checks `if (!row)` — falsy means "no
      // row". An empty array would be truthy and mis-map to a
      // zero-column object, so return `null` here.
      return { rows: null as unknown as unknown[] };
    }
    return { rows: Object.values(first) };
  }
  // 'all' and 'values' both want array-of-positional-arrays.
  const rows = allRows.map((row) => Object.values(row));
  return { rows };
}
