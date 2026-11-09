// GRIDA-SEC-004 — cooperative legacy chat admission and retirement.
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants, type Stats } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";
import { isMainThread } from "node:worker_threads";

const DIRECTORY = "legacy-chat-ownership";
const FILE = "control.sqlite";
const VERSION = 1;
const APPLICATION = 0x474c4353;
const MAX_DATABASE_BYTES = 1024 * 1024;
const ID = /^[a-zA-Z0-9_.:@/-]{1,128}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const OPEN = constants.O_NOFOLLOW | constants.O_NONBLOCK;
const execute = promisify(execFile);

type Source = Readonly<{ userDataPath: string; scratchBase: string }>;
type Identity = Readonly<{ sourceId: string; scratchId: string }>;
type State =
  | { kind: "clean"; claimId: string | null }
  | { kind: "active"; claimId: string }
  | { kind: "retired"; requestId: string; archiveId: string | null };

export type LegacyChatRetirement = Readonly<
  Identity & { requestId: string; archiveId: string | null }
>;

export type LegacyChatWriter = Readonly<{
  claimId: string;
  /** The owning supervisor verifies this exact generation and its workers. */
  completeDrain(verify: (claimId: string) => Promise<boolean>): Promise<void>;
}>;

type Retirement = Readonly<{
  requestId: string;
  /** Trusted deployment evidence that every supported writer obeys this gate. */
  verifyWriterAdmission(identity: Identity): Promise<boolean>;
  /** Verify the prior archive or capture and verify a new one. Null proves absence. */
  verifyArchive(retained: LegacyChatRetirement | null): Promise<string | null>;
}>;

/**
 * A committed active record is the lease. It remains dirty after process exit,
 * while SQLite releases the short exclusion transaction. Only a verified drain
 * of the issued generation clears it. Older writers can bypass this protocol.
 */
export class LegacyChatSourceLease {
  private readonly source: Source;

  constructor(source: Source) {
    this.source = Object.freeze({ ...source });
  }

  async claimWriter(): Promise<LegacyChatWriter> {
    const claimId = randomUUID();
    const identity = await this.transaction((db, current, identity) => {
      if (current.kind === "retired") throw failure("retired");
      if (current.kind === "active") throw failure("dirty");
      writeState(db, { kind: "active", claimId });
      return identity;
    });
    let completion: Promise<void> | undefined;
    return Object.freeze({
      claimId,
      completeDrain: (verify: (claimId: string) => Promise<boolean>) =>
        (completion ??= this.completeDrain(identity, claimId, verify).catch(
          (error: unknown) => {
            completion = undefined;
            throw error;
          }
        )),
    });
  }

  private async completeDrain(
    expected: Identity,
    claimId: string,
    verify: (claimId: string) => Promise<boolean>
  ): Promise<void> {
    await this.transaction(async (db, current, identity) => {
      if (
        !sameIdentity(identity, expected) ||
        current.kind === "retired" ||
        current.claimId !== claimId
      )
        throw failure("claim_changed");
      if (current.kind === "clean") return;
      if ((await verify(claimId)) !== true) throw failure("drain_unverified");
      writeState(db, { kind: "clean", claimId });
    });
  }

  async retire(request: Retirement): Promise<LegacyChatRetirement> {
    const { requestId, verifyWriterAdmission, verifyArchive } = request;
    if (!validId(requestId)) throw failure("invalid_request");
    return await this.transaction(async (db, current, identity) => {
      if (current.kind === "active") throw failure("dirty");
      if (current.kind === "retired" && current.requestId !== requestId)
        throw failure("retirement_changed");
      if ((await verifyWriterAdmission(identity)) !== true)
        throw failure("writer_admission_unverified");
      const retained =
        current.kind === "retired"
          ? Object.freeze({
              ...identity,
              requestId,
              archiveId: current.archiveId,
            })
          : null;
      const archiveId = await verifyArchive(retained);
      if (
        !validArchive(archiveId) ||
        (retained && retained.archiveId !== archiveId)
      )
        throw failure("archive_unverified");
      if (retained) return retained;
      writeState(db, { kind: "retired", requestId, archiveId });
      return Object.freeze({ ...identity, requestId, archiveId });
    });
  }

  private async transaction<T>(
    operation: (
      db: DatabaseSync,
      state: State,
      identity: Identity
    ) => T | Promise<T>
  ): Promise<T> {
    if (
      (process.platform !== "darwin" && process.platform !== "linux") ||
      !isMainThread ||
      !process.geteuid
    )
      throw failure("unsupported_platform");
    const source = await canonicalSource(this.source);
    const key = Symbol.for("grida.desktop.legacy-chat-source-lease.v1");
    const shared = globalThis as typeof globalThis & { [key: symbol]: unknown };
    shared[key] ??= new Set<string>();
    const active = shared[key];
    if (!(active instanceof Set)) throw failure("unsafe_state");
    // Closing a second POSIX descriptor for the same inode may release a
    // SQLite lock in this process. Serialize even the pre-open validation.
    if (active.has(source.lockKey)) throw failure("busy");
    active.add(source.lockKey);
    let db: DatabaseSync | undefined;
    try {
      const folder = path.join(source.directory, DIRECTORY);
      await ensurePrivateDirectory(folder);
      const filename = path.join(folder, FILE);
      await checkSidecars(filename);
      const initial = await openControlFile(filename);
      db = new DatabaseSync(filename, { timeout: 0, allowExtension: false });
      await checkControlIdentity(filename, initial);
      db.exec("PRAGMA trusted_schema=OFF; PRAGMA synchronous=FULL");
      if (db.prepare("PRAGMA journal_mode").get()?.journal_mode !== "delete")
        throw failure("unsafe_state");
      try {
        db.exec("BEGIN IMMEDIATE");
      } catch (error) {
        const code = (error as { errcode?: number }).errcode;
        if (typeof code === "number" && (code & 0xff) === 5)
          throw failure("busy");
        throw error;
      }
      const state = readState(db, source.identity);
      const result = await operation(db, state, source.identity);
      await checkControlIdentity(filename, initial);
      const current = await canonicalSource(this.source);
      if (!sameIdentity(source.identity, current.identity))
        throw failure("source_changed");
      db.exec("COMMIT");
      await syncDirectory(folder);
      await syncDirectory(source.directory);
      return result;
    } finally {
      try {
        // Closing with an open transaction rolls it back.
        db?.close();
      } finally {
        active.delete(source.lockKey);
      }
    }
  }
}

function readState(db: DatabaseSync, identity: Identity): State {
  const version = db.prepare("PRAGMA user_version").get()?.user_version;
  const application = db.prepare("PRAGMA application_id").get()?.application_id;
  if (
    version === 0 &&
    application === 0 &&
    db.prepare("SELECT COUNT(*) AS count FROM sqlite_schema").get()?.count === 0
  ) {
    db.exec(`
      PRAGMA application_id=${APPLICATION};
      PRAGMA user_version=${VERSION};
      CREATE TABLE ownership (
        id INTEGER PRIMARY KEY CHECK(id = 1),
        source_id TEXT NOT NULL,
        scratch_id TEXT NOT NULL,
        state TEXT NOT NULL
      ) STRICT;
    `);
    const state = { kind: "clean", claimId: null } as const;
    db.prepare("INSERT INTO ownership VALUES (1, ?, ?, ?)").run(
      identity.sourceId,
      identity.scratchId,
      JSON.stringify(state)
    );
    return state;
  }
  if (version !== VERSION || application !== APPLICATION)
    throw failure("unsafe_state");
  const row = db
    .prepare("SELECT source_id, scratch_id, state FROM ownership WHERE id=1")
    .get();
  if (!row || row.source_id !== identity.sourceId)
    throw failure("source_changed");
  if (row.scratch_id !== identity.scratchId) throw failure("scratch_changed");
  if (typeof row.state !== "string" || row.state.length > 512)
    throw failure("unsafe_state");
  let state: State;
  try {
    state = JSON.parse(row.state);
  } catch {
    throw failure("unsafe_state");
  }
  if (
    !state ||
    !(
      (state.kind === "clean" &&
        (state.claimId === null || validId(state.claimId))) ||
      (state.kind === "active" && validId(state.claimId)) ||
      (state.kind === "retired" &&
        validId(state.requestId) &&
        validArchive(state.archiveId))
    )
  )
    throw failure("unsafe_state");
  return state;
}

function writeState(db: DatabaseSync, state: State) {
  db.prepare("UPDATE ownership SET state=? WHERE id=1").run(
    JSON.stringify(state)
  );
}

async function canonicalSource(source: Source) {
  for (const directory of [source.userDataPath, source.scratchBase]) {
    if (
      !path.isAbsolute(directory) ||
      path.resolve(directory) !== directory ||
      path.dirname(directory) === directory
    )
      throw failure("unsafe_source");
  }
  const initial = await fs.lstat(source.userDataPath, { bigint: true });
  if (
    !initial.isDirectory() ||
    initial.uid !== BigInt(process.geteuid!()) ||
    (initial.mode & 0o022n) !== 0n
  )
    throw failure("unsafe_source");
  const directory = await fs.realpath(source.userDataPath);
  const current = await fs.lstat(directory, { bigint: true });
  if (current.dev !== initial.dev || current.ino !== initial.ino)
    throw failure("source_changed");
  await rejectAcl(directory);
  for (let parent = path.dirname(directory); ; parent = path.dirname(parent)) {
    const stat = await fs.lstat(parent);
    if (
      !stat.isDirectory() ||
      (stat.uid !== process.geteuid!() && stat.uid !== 0) ||
      ((stat.mode & 0o022) !== 0 && (stat.mode & 0o1000) === 0)
    )
      throw failure("unsafe_source");
    await rejectAcl(parent);
    if (path.dirname(parent) === parent) break;
  }
  return {
    directory,
    lockKey: `${initial.dev}:${initial.ino}`,
    identity: Object.freeze({
      sourceId: digest([
        "legacy-chat-source-v1",
        directory,
        initial.dev.toString(),
        initial.ino.toString(),
      ]),
      scratchId: digest(["legacy-chat-scratch-v1", source.scratchBase]),
    }),
  };
}

async function ensurePrivateDirectory(directory: string) {
  try {
    await fs.mkdir(directory, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const stat = await fs.lstat(directory);
  if (
    !stat.isDirectory() ||
    stat.uid !== process.geteuid!() ||
    (stat.mode & 0o7777) !== 0o700 ||
    (await fs.realpath(directory)) !== directory
  )
    throw failure("unsafe_state");
  await rejectAcl(directory);
}

async function openControlFile(filename: string) {
  const handle = await fs.open(
    filename,
    constants.O_RDWR | constants.O_CREAT | OPEN,
    0o600
  );
  try {
    const stat = await handle.stat();
    await checkControlIdentity(filename, stat);
    await rejectAcl(filename);
    return stat;
  } finally {
    await handle.close();
  }
}

async function checkControlIdentity(filename: string, expected: Stats) {
  const stat = await fs.lstat(filename);
  checkPrivateFile(stat);
  if (stat.dev !== expected.dev || stat.ino !== expected.ino)
    throw failure("unsafe_state");
}

async function checkSidecars(filename: string) {
  for (const suffix of ["-journal", "-wal", "-shm"]) {
    try {
      const stat = await fs.lstat(filename + suffix);
      if (suffix !== "-journal") throw failure("unsafe_state");
      checkPrivateFile(stat);
      await rejectAcl(filename + suffix);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

async function rejectAcl(filename: string) {
  if (process.platform !== "darwin") return;
  const { stdout } = await execute("/bin/ls", ["-lde", filename], {
    env: { LC_ALL: "C", LANG: "C" },
    timeout: 2_000,
    maxBuffer: 65_536,
  });
  if (/^\s*\d+:.*\ballow\b/m.test(stdout)) throw failure("unsafe_state");
}

function checkPrivateFile(stat: Stats) {
  if (
    !stat.isFile() ||
    stat.uid !== process.geteuid!() ||
    stat.nlink !== 1 ||
    (stat.mode & 0o7777) !== 0o600 ||
    stat.size > MAX_DATABASE_BYTES
  )
    throw failure("unsafe_state");
}

async function syncDirectory(directory: string) {
  const handle = await fs.open(
    directory,
    constants.O_RDONLY | constants.O_DIRECTORY | OPEN
  );
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function sameIdentity(a: Identity, b: Identity) {
  return a.sourceId === b.sourceId && a.scratchId === b.scratchId;
}

function digest(value: readonly string[]) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function validId(value: unknown): value is string {
  return typeof value === "string" && ID.test(value);
}

function validArchive(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && DIGEST.test(value));
}

function failure(code: string) {
  return new Error(`legacy_chat_source_${code}`);
}
