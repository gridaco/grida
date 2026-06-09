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
