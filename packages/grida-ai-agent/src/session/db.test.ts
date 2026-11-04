/**
 * Contract pins for the sessions DB open path: the `PRAGMA user_version`
 * gate (migration discipline) and the `withTx` transaction helper (the
 * atomicity guarantee the compaction/fork/rewind mutations depend on).
 *
 * These exist so the migration/transaction contracts are enforced by CI
 * rather than by memory — the first time a column-add lands without a
 * version bump, or a transaction wrapper regresses to autocommit, a test
 * goes red instead of a user's session log silently corrupting.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { openSessionsDb, type OpenedSessionsDb } from "./db";
import { SCHEMA_VERSION } from "./schema";
import { SessionsStore } from "./store";

/** A pre-`mode` (v1) `chat_sessions` table — the v2 schema MINUS `mode`. */
const V1_CHAT_SESSIONS_DDL = `
  CREATE TABLE chat_sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'New Chat',
    agent TEXT NOT NULL,
    workspace_id TEXT,
    workspace_root TEXT,
    model_json TEXT,
    parent_id TEXT,
    parent_message_id TEXT,
    permissions_json TEXT NOT NULL DEFAULT '[]',
    metadata_json TEXT NOT NULL DEFAULT '{}',
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    reasoning_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read INTEGER NOT NULL DEFAULT 0,
    cache_write INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    archived_at INTEGER
  );
`;

/** A v2 `chat_parts` table, before the continuation-run marker was added. */
const V2_CHAT_PARTS_DDL = `
  CREATE TABLE chat_parts (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    type TEXT NOT NULL,
    data_json TEXT NOT NULL,
    tool_call_id TEXT,
    tool_state TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`;

/**
 * The bootstrap the first session store (a9b78eec7) wrote, unstamped: the
 * pre-`mode`/pre-continuation tables and a NON-unique
 * `idx_chat_parts_message_index`. Its parts writer was read-then-insert with
 * no constraint, so racing writers could leave duplicate (message_id, index)
 * rows behind.
 */
const FIRST_STORE_BOOTSTRAP_SQL = `
  CREATE TABLE chat_sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'New Chat',
    agent TEXT NOT NULL,
    workspace_id TEXT,
    workspace_root TEXT,
    model_json TEXT,
    parent_id TEXT,
    parent_message_id TEXT,
    permissions_json TEXT NOT NULL DEFAULT '[]',
    metadata_json TEXT NOT NULL DEFAULT '{}',
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    reasoning_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read INTEGER NOT NULL DEFAULT 0,
    cache_write INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    archived_at INTEGER
  );
  CREATE TABLE chat_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    hidden_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE chat_parts (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    type TEXT NOT NULL,
    data_json TEXT NOT NULL,
    tool_call_id TEXT,
    tool_state TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX idx_chat_sessions_agent_updated
    ON chat_sessions(agent, updated_at);
  CREATE INDEX idx_chat_sessions_workspace_updated
    ON chat_sessions(workspace_id, updated_at);
  CREATE INDEX idx_chat_sessions_parent ON chat_sessions(parent_id);
  CREATE INDEX idx_chat_sessions_archived ON chat_sessions(archived_at);
  CREATE INDEX idx_chat_messages_session_created
    ON chat_messages(session_id, created_at);
  CREATE INDEX idx_chat_messages_hidden ON chat_messages(hidden_at);
  CREATE INDEX idx_chat_parts_message_index
    ON chat_parts(message_id, "index");
  CREATE INDEX idx_chat_parts_session ON chat_parts(session_id);
  CREATE INDEX idx_chat_parts_tool_call ON chat_parts(tool_call_id);
`;

/**
 * Write a first-store DB with one message whose index 0 was duplicated by
 * racing writers (`p_old` then `p_new`) and an unrelated part at index 1.
 * A `version` of 3 is that DB after a later build ran the v1 → v3 column
 * steps and stamped it, leaving the non-unique index in place.
 */
function writeFirstStoreDb(filePath: string, version: 0 | 3): void {
  const raw = new DatabaseSync(filePath);
  raw.exec(FIRST_STORE_BOOTSTRAP_SQL);
  if (version === 3) {
    raw.exec(`
      ALTER TABLE chat_sessions ADD COLUMN mode TEXT;
      ALTER TABLE chat_parts ADD COLUMN continuation_run_id TEXT;
    `);
  }
  raw.exec(`
    INSERT INTO chat_sessions (id, agent, created_at, updated_at)
      VALUES ('s1', 'grida', 0, 0);
    INSERT INTO chat_messages (id, session_id, role, created_at, updated_at)
      VALUES ('m1', 's1', 'assistant', 0, 0);
    INSERT INTO chat_parts
      (id, message_id, session_id, "index", type, data_json,
       created_at, updated_at)
    VALUES
      ('p_old', 'm1', 's1', 0, 'text', '{"type":"text","text":"h"}', 1, 1),
      ('p_new', 'm1', 's1', 0, 'text', '{"type":"text","text":"hi"}', 1, 2),
      ('p_next', 'm1', 's1', 1, 'text', '{"type":"text","text":"!"}', 3, 3);
  `);
  raw.exec(`PRAGMA user_version = ${version}`);
  raw.close();
}

/** Columns and indexes of every table, normalized for comparison. */
function schemaShape(sqlite: DatabaseSync) {
  const tables = (
    sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
      )
      .all() as Array<{ name: string }>
  ).map((t) => t.name);
  return tables.map((table) => ({
    table,
    // `ALTER TABLE … ADD COLUMN` appends, so column order is not compared.
    columns: (
      sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{
        name: string;
        type: string;
        notnull: number;
        dflt_value: unknown;
        pk: number;
      }>
    )
      .map(({ name, type, notnull, dflt_value, pk }) => ({
        name,
        type,
        notnull,
        dflt_value,
        pk,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    indexes: (
      sqlite.prepare(`PRAGMA index_list(${table})`).all() as Array<{
        name: string;
        unique: number;
      }>
    )
      .map(({ name, unique }) => ({
        name,
        unique,
        columns: (
          sqlite.prepare(`PRAGMA index_info(${name})`).all() as Array<{
            name: string;
          }>
        ).map((c) => c.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

function userVersion(db: OpenedSessionsDb): number {
  const row = db.sqlite.prepare("PRAGMA user_version").get() as {
    user_version?: number;
  };
  return row?.user_version ?? 0;
}

describe("openSessionsDb — user_version gate", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-agent-db-"));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("stamps a fresh DB to the current SCHEMA_VERSION", () => {
    const db = openSessionsDb({ user_data_path: dir });
    try {
      expect(userVersion(db)).toBe(SCHEMA_VERSION);
    } finally {
      db.close();
    }
  });

  it("re-opening an already-stamped DB is a no-op (stays at SCHEMA_VERSION)", () => {
    openSessionsDb({ user_data_path: dir }).close();
    const db = openSessionsDb({ user_data_path: dir });
    try {
      expect(userVersion(db)).toBe(SCHEMA_VERSION);
    } finally {
      db.close();
    }
  });

  it("migrates a pre-`mode` (v1) DB by adding the column (the column-add trap)", () => {
    // Build a v1-shaped DB on disk: chat_sessions WITHOUT `mode`, a real row,
    // stamped user_version=1. `CREATE TABLE IF NOT EXISTS` in the bootstrap is a
    // NO-OP on an existing table — it does NOT add the column — so only the
    // ALTER-ladder can. This pins that the ladder runs.
    const filePath = path.join(dir, "sessions.db");
    const raw = new DatabaseSync(filePath);
    raw.exec(V1_CHAT_SESSIONS_DDL);
    raw.exec(
      `INSERT INTO chat_sessions (id, title, agent, created_at, updated_at) ` +
        `VALUES ('s1', 't', 'grida', 0, 0)`
    );
    raw.exec("PRAGMA user_version = 1");
    raw.close();

    const db = openSessionsDb({ user_data_path: dir });
    try {
      // The ladder ran and the gate re-stamped to current.
      expect(userVersion(db)).toBe(SCHEMA_VERSION);
      // The legacy row reads with a null mode — no `no such column`.
      const row = db.sqlite
        .prepare("SELECT mode FROM chat_sessions WHERE id = 's1'")
        .get();
      expect(row).toEqual({ mode: null });
      // And the column is writable.
      db.sqlite.exec("UPDATE chat_sessions SET mode = 'auto' WHERE id = 's1'");
      const updated = db.sqlite
        .prepare("SELECT mode FROM chat_sessions WHERE id = 's1'")
        .get();
      expect(updated).toEqual({ mode: "auto" });
    } finally {
      db.close();
    }
  });

  it("GRIDA-SEC-004: migrates the continuation marker without marking history", () => {
    const filePath = path.join(dir, "sessions.db");
    const raw = new DatabaseSync(filePath);
    raw.exec(V2_CHAT_PARTS_DDL);
    raw.exec(
      `INSERT INTO chat_parts
         (id, message_id, session_id, "index", type, data_json,
          tool_call_id, tool_state, created_at, updated_at)
       VALUES
         ('p1', 'm1', 's1', 0, 'tool-question',
          '{"type":"tool-question","state":"output-available","output":{"answers":[["Blue"]]}}',
          'q1', 'output-available', 0, 0)`
    );
    raw.exec("PRAGMA user_version = 2");
    raw.close();

    const db = openSessionsDb({ user_data_path: dir });
    try {
      expect(userVersion(db)).toBe(SCHEMA_VERSION);
      const row = db.sqlite
        .prepare("SELECT continuation_run_id FROM chat_parts WHERE id = 'p1'")
        .get();
      expect(row).toEqual({ continuation_run_id: null });
      db.sqlite.exec(
        "UPDATE chat_parts SET continuation_run_id = 'run_1' WHERE id = 'p1'"
      );
      expect(
        db.sqlite
          .prepare("SELECT continuation_run_id FROM chat_parts WHERE id = 'p1'")
          .get()
      ).toEqual({ continuation_run_id: "run_1" });
    } finally {
      db.close();
    }
  });

  it.each([
    ["an unstamped", 0],
    ["an already-stamped v3", 3],
  ] as const)(
    "repairs the non-unique chat_parts index on %s first-store DB",
    async (_, version) => {
      writeFirstStoreDb(path.join(dir, "sessions.db"), version);

      const db = openSessionsDb({ user_data_path: dir });
      const store = new SessionsStore(db);
      try {
        expect(userVersion(db)).toBe(SCHEMA_VERSION);
        expect(
          db.sqlite
            .prepare(
              `SELECT "unique" FROM pragma_index_list('chat_parts')
               WHERE name = 'idx_chat_parts_message_index'`
            )
            .get()
        ).toEqual({ unique: 1 });
        // The duplicate collapsed to its most recent write; nothing else went.
        expect(
          db.sqlite
            .prepare(`SELECT id FROM chat_parts ORDER BY "index", id`)
            .all()
        ).toEqual([{ id: "p_new" }, { id: "p_next" }]);

        // The index-keyed upsert now has its conflict target.
        const part = await store.upsertPart("m1", {
          index: 0,
          type: "text",
          data: { type: "text", text: "hello" },
        });
        expect(part.id).toBe("p_new");
        const [message] = await store.listMessages("s1");
        expect(message.parts.map((p) => p.data)).toEqual([
          { type: "text", text: "hello" },
          { type: "text", text: "!" },
        ]);
      } finally {
        store.close();
      }

      // Re-opening the repaired DB is a no-op.
      const reopened = openSessionsDb({ user_data_path: dir });
      try {
        expect(userVersion(reopened)).toBe(SCHEMA_VERSION);
        expect(
          reopened.sqlite.prepare(`SELECT count(*) AS n FROM chat_parts`).get()
        ).toEqual({ n: 2 });
      } finally {
        reopened.close();
      }
    }
  );

  it("brings a first-store DB to the same schema as a fresh one", () => {
    // Drift guard: `CREATE ... IF NOT EXISTS` never changes an existing
    // definition, so any schema change without a ladder step shows up here.
    const fresh = openSessionsDb({ db_file: ":memory:", user_data_path: dir });
    writeFirstStoreDb(path.join(dir, "sessions.db"), 0);
    const migrated = openSessionsDb({ user_data_path: dir });
    try {
      expect(schemaShape(migrated.sqlite)).toEqual(schemaShape(fresh.sqlite));
    } finally {
      fresh.close();
      migrated.close();
    }
  });

  it("refuses a forward-incompatible DB stamped ABOVE this build's version", () => {
    const db = openSessionsDb({ user_data_path: dir });
    db.sqlite.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
    db.close();
    // An older binary opening a newer DB would miss columns and throw
    // `no such column` mid-use; the gate makes it fail loud at open instead.
    expect(() => openSessionsDb({ user_data_path: dir })).toThrow(/version/i);
  });
});

describe("openSessionsDb — withTx", () => {
  let dir: string;
  let db: OpenedSessionsDb;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-agent-tx-"));
    db = openSessionsDb({ user_data_path: dir });
    db.sqlite.exec("CREATE TABLE t (x INTEGER)");
  });

  afterEach(async () => {
    db.close();
    await fs.rm(dir, { recursive: true, force: true });
  });

  function rowCount(): number {
    const row = db.sqlite.prepare("SELECT count(*) AS c FROM t").get() as {
      c: number;
    };
    return row.c;
  }

  it("commits the whole sequence when fn resolves", async () => {
    await db.withTx(async () => {
      db.sqlite.exec("INSERT INTO t VALUES (1)");
      db.sqlite.exec("INSERT INTO t VALUES (2)");
    });
    expect(rowCount()).toBe(2);
  });

  it("rolls back every write when fn throws (no partial sequence survives)", async () => {
    await expect(
      db.withTx(async () => {
        db.sqlite.exec("INSERT INTO t VALUES (1)");
        // Crash mid-sequence — the first insert must NOT survive.
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    expect(rowCount()).toBe(0);
  });
});
