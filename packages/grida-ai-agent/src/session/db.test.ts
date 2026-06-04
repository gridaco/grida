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
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { openSessionsDb, type OpenedSessionsDb } from "./db";
import { SCHEMA_VERSION } from "./schema";

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
