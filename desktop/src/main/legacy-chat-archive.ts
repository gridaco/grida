// GRIDA-SEC-004 — private preservation of the retired chat store and scratch.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants, type Stats } from "node:fs";
import fs, { type FileHandle } from "node:fs/promises";
import path from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import { setTimeout } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const DB_NAME = "sessions.db";
const WAL_SIDECARS = ["-wal", "-shm"] as const;
const DB_SIDECARS = [...WAL_SIDECARS, "-journal"] as const;
const READ_ONLY_MODE = 0o400;
const ROLLBACK_HEADER_BYTES = 28;
const ARCHIVE_NAME = "chat-archive";
const MANIFEST_NAME = "manifest.json";
const PENDING_NAME = ".pending";
const MAX_ENTRIES = 100_000;
const MAX_DEPTH = 32;
const MAX_PATH_BYTES = 16 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 32 * 1024 * 1024;
const MAX_DESCRIPTOR_BYTES = 64 * 1024;
const RETIRED_VERSION = 2_147_483_647;
const SEAL_TABLE = "grida_legacy_chat_retirement";
const SEAL_SCHEMA = `CREATE TABLE ${SEAL_TABLE} (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      request_id TEXT NOT NULL,
      archive_id TEXT NOT NULL
    ) STRICT`;
const DIGEST = /^[a-f0-9]{64}$/;
const REQUEST_ID = /^[a-zA-Z0-9_.:@/-]{1,128}$/;
const READ_FLAGS =
  constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
// Historical on-disk types. This reader outlives the old writer package.
const FILE_ATTACHMENTS = "data-user_file_attachments";
const TEMPLATE_SELECTION = "data-user_template_selection";

const SCRATCH_ARCHIVES = ["scratch", "scratch-srt"] as const;
type ScratchArchive = (typeof SCRATCH_ARCHIVES)[number];
type ScratchBudget = { entries: number; pathBytes: number };
type Source = Readonly<{
  userDataPath: string;
  scratchBase: string;
  /** Exact canonical temp root attested from the legacy SRT launch. The
   * caller also establishes quiescence for this root before capture. */
  historicalSrtTempRoot?: string;
}>;
type FileEvidence = { path: string; size: number; sha256: string };
type InputCaveat = {
  partId: string;
  path?: string;
  reason:
    | "missing"
    | "size_changed"
    | "historical_scratch_candidate"
    | "scratch_candidates_differ"
    | "invalid_descriptor"
    | "template_scratch_missing"
    | "template_members_unknown";
};
type Manifest = {
  version: 1;
  sqliteVersion: number;
  sessionCount: number;
  files: FileEvidence[];
  inputCaveats: InputCaveat[];
};
type Receipt = {
  id: string;
  directory: string;
  sqliteVersion: number;
  sessionCount: number;
  inputCaveats: readonly InputCaveat[];
};
type Seal = Readonly<{
  requestId: string;
  expectedArchiveId?: string;
  requireReadOnlySource?: boolean;
}>;

/** Main-owned cutover evidence. The caller must close old chat admission, stop
 * the exact legacy writer and its scratch work, and prevent its restart for
 * the whole snapshot. SQLite's writer fence protects this snapshot; it does
 * not discover processes or authorize retirement of the source.
 */
export class LegacyChatArchive {
  private pending: Promise<Receipt | null> | undefined;
  private readonly source: Source;
  readonly historicalScratchBase: string | undefined;

  constructor(source: Source) {
    this.source = { ...source };
    if (source.historicalSrtTempRoot !== undefined) {
      this.historicalScratchBase = historicalScratchBase(
        source.userDataPath,
        source.historicalSrtTempRoot
      );
    }
  }

  snapshotQuiesced(): Promise<Receipt | null> {
    if (!this.pending) {
      this.pending = this.snapshot()
        .catch(safeFailure)
        .finally(() => {
          this.pending = undefined;
        });
    }
    return this.pending;
  }

  /** The caller owns the legacy-source lease and has verified writer and
   * command shutdown. Seal the historical SQLite opener only after the exact
   * archive is durable. A retained seal can recover an interrupted cutover.
   */
  async sealQuiesced(seal: Seal): Promise<Receipt> {
    try {
      if (
        !REQUEST_ID.test(seal.requestId) ||
        (seal.expectedArchiveId !== undefined &&
          !DIGEST.test(seal.expectedArchiveId))
      )
        throw new ArchiveFailure("invalid_source_seal");
      if (
        seal.requireReadOnlySource &&
        (process.platform !== "darwin" || !process.geteuid?.())
      )
        throw new ArchiveFailure("unsupported_platform");
      const receipt = await this.snapshot(seal);
      if (!receipt) throw new ArchiveFailure("source_missing");
      return receipt;
    } catch (error) {
      return safeFailure(error);
    }
  }

  /** Verify a published cutoff. This does not check for later source changes. */
  async verify(id: string): Promise<Receipt> {
    try {
      if (!DIGEST.test(id)) throw new ArchiveFailure("invalid_receipt");
      const userData = await canonicalDirectory(this.source.userDataPath);
      if (!userData) throw new ArchiveFailure("invalid_receipt");
      requirePrivatePlatform();
      const parent = path.join(userData, ARCHIVE_NAME);
      await checkArchiveRoot(parent);
      return await verifyArchive(parent, id);
    } catch (error) {
      return safeFailure(error);
    }
  }

  private async snapshot(seal?: Seal): Promise<Receipt | null> {
    const userData = await canonicalDirectory(this.source.userDataPath);
    if (!userData) return null;
    const directoryStat = await fs.lstat(userData);
    checkSourceDirectory(directoryStat);
    const sourceDb = path.join(userData, DB_NAME);
    const databaseStat = await statIfPresent(sourceDb);
    const sidecars = await sourceSidecars(sourceDb);
    if (!databaseStat) {
      if (sidecars.some(Boolean)) throw new ArchiveFailure("unsafe_source");
      if (await statIfPresent(path.join(userData, ARCHIVE_NAME))) {
        throw new ArchiveFailure("source_missing");
      }
      return null;
    }
    requirePrivatePlatform();
    for (const stat of [databaseStat, ...sidecars])
      if (stat) checkSourceFile(stat);

    // SQLite guards the opened inode. Confirm that the configured directory
    // and its database still name the same objects after archive I/O.
    const confirmLocation = async () => {
      const directory = await statIfPresent(this.source.userDataPath);
      if (
        !directory ||
        !sameIdentity(directoryStat, directory) ||
        (await fs.realpath(this.source.userDataPath)) !== userData
      )
        throw new ArchiveFailure("source_changed");
      checkSourceDirectory(directory);
      const database = await statIfPresent(sourceDb);
      if (!database || !sameIdentity(databaseStat, database))
        throw new ArchiveFailure("source_changed");
      checkSourceFile(database);
      return database;
    };
    const parent = path.join(userData, ARCHIVE_NAME);
    if (
      seal?.requireReadOnlySource &&
      (databaseStat.mode & 0o7777) === READ_ONLY_MODE
    ) {
      await confirmReadOnlySource(sourceDb, databaseStat, confirmLocation);
      const archived = readFrozenSeal(sourceDb, seal);
      await checkArchiveRoot(parent);
      const verified = await verifyArchive(parent, archived);
      await confirmReadOnlySource(sourceDb, databaseStat, confirmLocation);
      return verified;
    }
    if (seal?.requireReadOnlySource) await checkSourceFenceAcl(sourceDb);
    const guard = seal
      ? acquireSourceSealFence(sourceDb, seal)
      : await acquireWriterFence(sourceDb);
    let stage: string | undefined;
    let pinnedSource: FileHandle | undefined;
    let frozen: { receipt: Receipt; source: Stats } | undefined;
    try {
      const current = await confirmLocation();
      if (
        seal?.requireReadOnlySource &&
        (await sourceSidecars(sourceDb, WAL_SIDECARS)).some(Boolean)
      )
        throw new ArchiveFailure("source_fence_incomplete");
      let interruptedArchive: Receipt | undefined;
      if (seal) {
        const retained = readSourceSeal(guard, seal);
        if (retained) {
          if (
            seal.requireReadOnlySource &&
            seal.expectedArchiveId !== undefined
          )
            throw new ArchiveFailure("source_fence_incomplete");
          await checkArchiveRoot(parent);
          const verified = await verifyArchive(parent, retained);
          if (!sameSnapshot(current, await confirmLocation()))
            throw new ArchiveFailure("source_changed");
          if (!seal.requireReadOnlySource) return verified;
          // The lease never accepted this writable seal. Older writers may
          // have changed the source after it was backed up.
          interruptedArchive = verified;
        }
      }
      await makePrivateDirectory(parent);
      await checkArchiveRoot(parent);
      const pending = path.join(parent, PENDING_NAME);
      const interrupted = await statIfPresent(pending);
      if (interrupted) {
        checkPrivateDirectory(interrupted);
        await fs.rm(pending, { recursive: true });
      }
      await fs.mkdir(pending, { mode: 0o700 });
      stage = pending;
      checkPrivateDirectory(await fs.lstat(stage));
      const archivedDb = path.join(stage, DB_NAME);
      const empty = await fs.open(archivedDb, "wx", 0o600);
      await empty.close();
      const reader = seal
        ? guard
        : new DatabaseSync(sourceDb, { readOnly: true });
      try {
        await backup(reader, archivedDb);
      } finally {
        if (!seal) reader.close();
      }
      // Make the archive independent of source or destination WAL sidecars.
      const destination = new DatabaseSync(archivedDb);
      try {
        const mode = destination.prepare("PRAGMA journal_mode = DELETE").get();
        if (mode?.journal_mode !== "delete")
          throw new ArchiveFailure("invalid_database");
        if (seal && interruptedArchive)
          normalizeRecoveryCopy(destination, seal, interruptedArchive);
      } finally {
        destination.close();
      }
      await syncFile(archivedDb);
      const scratch = await canonicalDirectory(this.source.scratchBase);
      if (
        scratch &&
        (contains(scratch, userData) || contains(userData, scratch))
      ) {
        throw new ArchiveFailure("unsafe_source");
      }
      const historicalScratch = await captureHistoricalScratch(
        this.historicalScratchBase,
        userData,
        scratch
      );
      const { sessions } = readDatabase(archivedDb);
      const budget = { entries: 0, pathBytes: 0 };
      const copied = scratch
        ? await copyScratch(scratch, stage, sessions, "scratch", budget)
        : [];
      if (historicalScratch) {
        const historicalFiles = await copyScratch(
          historicalScratch.directory,
          stage,
          sessions,
          "scratch-srt",
          budget
        );
        const current = await fs.lstat(historicalScratch.directory);
        if (!sameSnapshot(historicalScratch.stat, current))
          throw new ArchiveFailure("source_changed");
        for (const file of historicalFiles) copied.push(file);
      }
      const manifest = await inspectArchive(stage);
      if (
        JSON.stringify(copied.sort(comparePaths)) !==
        JSON.stringify(manifest.files.filter((file) => file.path !== DB_NAME))
      ) {
        throw new ArchiveFailure("source_changed");
      }
      const encoded = encodeManifest(manifest);
      const id = sha256(encoded);
      const manifestFile = await fs.open(
        path.join(stage, MANIFEST_NAME),
        "wx",
        0o600
      );
      try {
        await manifestFile.writeFile(encoded);
        await manifestFile.sync();
      } finally {
        await manifestFile.close();
      }
      await syncDirectory(stage);
      if (!sameSnapshot(current, await fs.lstat(sourceDb))) {
        throw new ArchiveFailure("source_changed");
      }
      const published = path.join(parent, id);
      let receipt: Receipt;
      if (await statIfPresent(published)) {
        receipt = await verifyArchive(parent, id);
        await fs.rm(stage, { recursive: true });
        stage = undefined;
      } else {
        await fs.rename(stage, published);
        stage = undefined;
        receipt = archiveReceipt(published, id, manifest);
      }
      await syncDirectory(parent);
      await syncDirectory(userData);
      if (!seal) return receipt;
      const verified = await verifyArchive(parent, receipt.id);
      if (seal.requireReadOnlySource) {
        await checkSourceFenceAcl(sourceDb);
        pinnedSource = await fs.open(sourceDb, READ_FLAGS);
        if (!sameSnapshot(current, await pinnedSource.stat()))
          throw new ArchiveFailure("source_changed");
      }
      if (!sameSnapshot(current, await confirmLocation()))
        throw new ArchiveFailure("source_changed");
      commitSourceSeal(
        guard,
        seal.requestId,
        verified.id,
        interruptedArchive?.id
      );
      readSourceSeal(guard, { ...seal, expectedArchiveId: verified.id });
      await syncDirectory(userData);
      await confirmLocation();
      if (!pinnedSource) return verified;
      try {
        await pinnedSource.chmod(READ_ONLY_MODE);
        await pinnedSource.sync();
      } catch {
        throw new ArchiveFailure("source_fence_incomplete");
      }
      frozen = { receipt: verified, source: await pinnedSource.stat() };
    } finally {
      try {
        if (stage) await fs.rm(stage, { recursive: true, force: true });
      } finally {
        // Closing another descriptor of the same inode can release SQLite's
        // POSIX locks. The mode change keeps its descriptor until guard close.
        try {
          guard.close();
        } finally {
          await pinnedSource?.close();
        }
      }
    }
    await confirmReadOnlySource(sourceDb, frozen.source, confirmLocation);
    return frozen.receipt;
  }
}

type FailureCode =
  | "unsafe_source"
  | "source_missing"
  | "source_changed"
  | "source_busy"
  | "source_fence_incomplete"
  | "unsupported_platform"
  | "unsafe_archive"
  | "invalid_database"
  | "unsupported_schema"
  | "invalid_source_seal"
  | "invalid_receipt"
  | "archive_limit"
  | "archive_io";

class ArchiveFailure extends Error {
  constructor(readonly code: FailureCode) {
    super(`Legacy chat archive: ${code}`);
  }
}

function safeFailure(error: unknown): never {
  throw error instanceof ArchiveFailure
    ? error
    : new ArchiveFailure("archive_io");
}

async function acquireWriterFence(source: string): Promise<DatabaseSync> {
  const deadline = performance.now() + 5_000;
  const uri = `${pathToFileURL(source).href}?mode=rw`;
  for (;;) {
    const db = new DatabaseSync(uri, { timeout: 0 });
    try {
      db.exec("BEGIN IMMEDIATE");
      return db;
    } catch (error) {
      db.close();
      if ((error as { errcode?: number }).errcode !== 5) throw error;
      if (performance.now() >= deadline)
        throw new ArchiveFailure("source_busy");
      await setTimeout(50);
    }
  }
}

function acquireSourceSealFence(source: string, seal: Seal): DatabaseSync {
  // This preliminary refusal check must not create WAL sidecars. The
  // exclusive guard below reads and checks the actual state before archiving.
  const probePath = seal.requireReadOnlySource
    ? `${pathToFileURL(source).href}?mode=ro&immutable=1`
    : source;
  const probe = new DatabaseSync(probePath, { readOnly: true, timeout: 0 });
  try {
    if (
      readSourceSeal(probe, seal) &&
      seal.requireReadOnlySource &&
      seal.expectedArchiveId !== undefined
    )
      throw new ArchiveFailure("source_fence_incomplete");
  } catch (error) {
    if (sqliteBusy(error)) throw new ArchiveFailure("source_busy");
    throw error;
  } finally {
    probe.close();
  }
  const uri = `${pathToFileURL(source).href}?mode=rw`;
  const db = new DatabaseSync(uri, { timeout: 0, allowExtension: false });
  try {
    db.exec(
      "PRAGMA trusted_schema=OFF; PRAGMA locking_mode=EXCLUSIVE; PRAGMA synchronous=FULL"
    );
    // WAL's BEGIN EXCLUSIVE takes a writer lock. Changing out of WAL must
    // also exclude existing WAL connections. Keep the database lock after
    // the empty transaction so backup can read from this same connection.
    if (
      db.prepare("PRAGMA journal_mode=DELETE").get()?.journal_mode !== "delete"
    )
      throw new ArchiveFailure("source_busy");
    db.exec("BEGIN EXCLUSIVE; COMMIT");
    return db;
  } catch (error) {
    db.close();
    if (sqliteBusy(error)) throw new ArchiveFailure("source_busy");
    throw error;
  }
}

function normalizeRecoveryCopy(
  db: DatabaseSync,
  seal: Seal,
  original: Receipt
) {
  if (
    readSourceSeal(db, { ...seal, expectedArchiveId: original.id }) !==
    original.id
  )
    throw new ArchiveFailure("invalid_source_seal");
  const ownedObjects = db
    .prepare(
      "SELECT type, sql FROM sqlite_schema WHERE tbl_name=? OR instr(lower(sql), ?) > 0 LIMIT 2"
    )
    .all(SEAL_TABLE, SEAL_TABLE);
  if (
    ownedObjects.length !== 1 ||
    ownedObjects[0]?.type !== "table" ||
    ownedObjects[0]?.sql !== SEAL_SCHEMA
  )
    throw new ArchiveFailure("invalid_source_seal");
  // Remove only our retirement metadata from the backup. Erasing its freed
  // bytes keeps an unchanged retry independent of the previous archive ID.
  db.exec(`PRAGMA foreign_keys=OFF; PRAGMA secure_delete=ON;
    BEGIN IMMEDIATE; DROP TABLE ${SEAL_TABLE};
    PRAGMA user_version=${original.sqliteVersion}; COMMIT;`);
}

function readFrozenSeal(sourceDb: string, seal: Seal): string {
  const source = new DatabaseSync(sourceDb, {
    readOnly: true,
    timeout: 0,
    allowExtension: false,
  });
  try {
    const archived = readSourceSeal(source, seal);
    if (
      !archived ||
      source.prepare("PRAGMA journal_mode").get()?.journal_mode !== "delete"
    )
      throw new ArchiveFailure("source_fence_incomplete");
    return archived;
  } finally {
    source.close();
  }
}

async function sourceSidecars(
  sourceDb: string,
  suffixes: readonly string[] = DB_SIDECARS
) {
  return Promise.all(
    suffixes.map((suffix) => statIfPresent(sourceDb + suffix))
  );
}

async function checkSourceFenceAcl(sourceDb: string): Promise<void> {
  await checkSourcePathAcl(sourceDb);
  await checkSourcePathAcl(path.dirname(sourceDb));
}

async function checkSourcePathAcl(target: string): Promise<void> {
  const { stdout } = await promisify(execFile)("/bin/ls", ["-ldeb", target], {
    env: { LC_ALL: "C", LANG: "C" },
    timeout: 2_000,
    maxBuffer: 65_536,
  });
  if (!/^[d-][rwxstST-]{9}[@ ]/.test(stdout) || /^\s*\d+:/m.test(stdout))
    throw new ArchiveFailure("unsafe_source");
}

async function confirmReadOnlySource(
  sourceDb: string,
  source: Stats,
  confirmLocation: () => Promise<Stats>
): Promise<void> {
  if ((source.mode & 0o7777) !== READ_ONLY_MODE)
    throw new ArchiveFailure("source_fence_incomplete");
  await checkSourceFenceAcl(sourceDb);
  const [wal, shared, rollback] = await sourceSidecars(sourceDb);
  if (wal || shared) throw new ArchiveFailure("source_fence_incomplete");
  if (rollback) await verifyInactiveRollback(`${sourceDb}-journal`, rollback);
  const current = await confirmLocation();
  if ((current.mode & 0o7777) !== READ_ONLY_MODE)
    throw new ArchiveFailure("source_fence_incomplete");
  if (!sameSnapshot(source, current))
    throw new ArchiveFailure("source_changed");
}

async function verifyInactiveRollback(filename: string, original: Stats) {
  checkSourceFile(original);
  await checkSourcePathAcl(filename);
  const journal = await fs.open(filename, READ_FLAGS);
  try {
    const opened = await journal.stat();
    if (!sameSnapshot(original, opened))
      throw new ArchiveFailure("source_changed");
    // SQLite can leave a committed rollback journal after an exclusive
    // connection exits abruptly. An empty journal or zeroed header is inert.
    const header = Buffer.alloc(ROLLBACK_HEADER_BYTES);
    const { bytesRead } = await journal.read(header, 0, header.length, 0);
    if (
      opened.size !== 0 &&
      (bytesRead !== header.length || header.some((byte) => byte !== 0))
    )
      throw new ArchiveFailure("source_fence_incomplete");
    if (
      !sameSnapshot(opened, await journal.stat()) ||
      !sameSnapshot(opened, await fs.lstat(filename))
    )
      throw new ArchiveFailure("source_changed");
  } finally {
    await journal.close();
  }
}

function readSourceSeal(db: DatabaseSync, seal: Seal): string | null {
  db.exec("PRAGMA trusted_schema=OFF");
  const version = db.prepare("PRAGMA user_version").get()?.user_version;
  if (
    version !== RETIRED_VERSION &&
    (typeof version !== "number" || version < 0 || version > 3)
  )
    throw new ArchiveFailure("unsupported_schema");
  const table = db
    .prepare("SELECT type FROM sqlite_schema WHERE name=?")
    .get(SEAL_TABLE);
  if (version !== RETIRED_VERSION) {
    if (table || seal.expectedArchiveId !== undefined)
      throw new ArchiveFailure("invalid_source_seal");
    return null;
  }
  if (table?.type !== "table") throw new ArchiveFailure("invalid_source_seal");
  const rows = db
    .prepare(`SELECT id, request_id, archive_id FROM ${SEAL_TABLE} LIMIT 2`)
    .all();
  const row = rows[0];
  if (
    rows.length !== 1 ||
    row.id !== 1 ||
    row.request_id !== seal.requestId ||
    typeof row.archive_id !== "string" ||
    !DIGEST.test(row.archive_id) ||
    (seal.expectedArchiveId !== undefined &&
      row.archive_id !== seal.expectedArchiveId)
  )
    throw new ArchiveFailure("invalid_source_seal");
  return row.archive_id;
}

function commitSourceSeal(
  db: DatabaseSync,
  requestId: string,
  archiveId: string,
  previousArchiveId: string | undefined
) {
  if (previousArchiveId === archiveId) return;
  db.exec("BEGIN IMMEDIATE");
  if (previousArchiveId !== undefined) {
    const replaced = db
      .prepare(
        `UPDATE ${SEAL_TABLE} SET archive_id=? WHERE id=1 AND request_id=? AND archive_id=?`
      )
      .run(archiveId, requestId, previousArchiveId);
    if (replaced.changes !== 1) throw new ArchiveFailure("invalid_source_seal");
    db.exec("COMMIT");
    return;
  }
  db.exec(`${SEAL_SCHEMA};`);
  db.prepare(`INSERT INTO ${SEAL_TABLE} VALUES (1, ?, ?)`).run(
    requestId,
    archiveId
  );
  db.exec(`PRAGMA user_version=${RETIRED_VERSION}; COMMIT`);
}

function sqliteBusy(error: unknown): boolean {
  const code = (error as { errcode?: number })?.errcode;
  return typeof code === "number" && (code & 0xff) === 5;
}

function readDatabase(filename: string) {
  const db = new DatabaseSync(filename, { readOnly: true });
  try {
    db.exec("PRAGMA trusted_schema = OFF");
    const sqliteVersion = db.prepare("PRAGMA user_version").get()?.user_version;
    if (
      typeof sqliteVersion !== "number" ||
      sqliteVersion < 0 ||
      sqliteVersion > 3
    ) {
      throw new ArchiveFailure("unsupported_schema");
    }
    if (db.prepare("PRAGMA quick_check(1)").get()?.quick_check !== "ok") {
      throw new ArchiveFailure("invalid_database");
    }
    const sessions = new Set<string>();
    for (const { id } of db
      .prepare("SELECT id FROM chat_sessions ORDER BY id")
      .iterate()) {
      if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
        throw new ArchiveFailure("invalid_database");
      }
      if (sessions.size >= MAX_ENTRIES)
        throw new ArchiveFailure("archive_limit");
      sessions.add(id);
    }
    return { sqliteVersion, sessions };
  } finally {
    db.close();
  }
}

function historicalScratchBase(userDataPath: string, temp: string): string {
  if (
    !path.isAbsolute(temp) ||
    path.resolve(temp) !== temp ||
    path.dirname(temp) === temp
  ) {
    throw new ArchiveFailure("unsafe_source");
  }
  // Before Desktop injected a scratch base, the sidecar derived this name
  // from its exact configured data path and the SRT child's os.tmpdir().
  const tag = sha256(Buffer.from(path.resolve(userDataPath))).slice(0, 16);
  return path.join(temp, `grida-agent-${tag}`);
}

async function captureHistoricalScratch(
  candidate: string | undefined,
  userData: string,
  scratch: string | undefined
) {
  if (candidate === undefined) return;
  const temp = path.dirname(candidate);
  const tempStat = await statIfPresent(temp);
  if (!tempStat) return;
  if (!tempStat.isDirectory() || (await fs.realpath(temp)) !== temp)
    throw new ArchiveFailure("unsafe_source");
  const otherRoots = [userData, scratch].filter((root) => root !== undefined);
  if (
    otherRoots.some(
      (root) => contains(root, candidate) || contains(candidate, root)
    )
  ) {
    throw new ArchiveFailure("unsafe_source");
  }
  const directory = await canonicalDirectory(candidate);
  if (!directory) return;
  if (directory !== candidate) throw new ArchiveFailure("unsafe_source");
  const stat = await fs.lstat(directory);
  checkSourceDirectory(stat);
  for (const root of otherRoots) {
    if (sameIdentity(stat, await fs.lstat(root)))
      throw new ArchiveFailure("unsafe_source");
  }
  return { directory, stat };
}

async function copyScratch(
  scratch: string,
  stage: string,
  sessions: Set<string>,
  section: ScratchArchive,
  budget: ScratchBudget
): Promise<FileEvidence[]> {
  const sessionsRoot = path.join(scratch, "sessions");
  const root = await statIfPresent(sessionsRoot);
  if (!root) return [];
  checkSourceDirectory(root);
  const destination = path.join(stage, section);
  await makePrivateDirectory(destination);
  const copied: FileEvidence[] = [];
  for (const id of sessions) {
    const session = path.join(sessionsRoot, id);
    const stat = await statIfPresent(session);
    if (!stat) continue;
    checkSourceDirectory(stat);
    const source = path.join(session, "scratch");
    const ownScratch = await statIfPresent(source);
    if (!ownScratch) continue;
    checkSourceDirectory(ownScratch);
    const target = path.join(destination, id);
    await makePrivateDirectory(target);
    await walk(
      source,
      budget,
      0,
      async (file, relative, directory) => {
        const output = path.join(target, relative);
        if (directory) await makePrivateDirectory(output);
        else
          copied.push({
            path: [section, id, ...relative.split(path.sep)].join("/"),
            ...(await digestFile(file, output)),
          });
      },
      async (relative) => syncDirectory(path.join(target, relative))
    );
    if (!sameSnapshot(stat, await fs.lstat(session)))
      throw new ArchiveFailure("source_changed");
  }
  if (!sameSnapshot(root, await fs.lstat(sessionsRoot)))
    throw new ArchiveFailure("source_changed");
  await syncDirectory(destination);
  return copied;
}

async function inspectArchive(
  directory: string,
  retainedId?: string
): Promise<Manifest> {
  checkPrivateDirectory(await fs.lstat(directory));
  const entries = await fs.opendir(directory);
  for await (const entry of entries) {
    if (![DB_NAME, MANIFEST_NAME, ...SCRATCH_ARCHIVES].includes(entry.name)) {
      throw new ArchiveFailure("invalid_receipt");
    }
  }
  const database = path.join(directory, DB_NAME);
  const files: FileEvidence[] = [
    { path: DB_NAME, ...(await digestFile(database, undefined, true)) },
  ];
  const { sqliteVersion, sessions } = readDatabase(database);
  const budget = { entries: 0, pathBytes: 0 };
  for (const section of SCRATCH_ARCHIVES) {
    const scratch = path.join(directory, section);
    if (!(await statIfPresent(scratch))) continue;
    await walk(scratch, budget, 0, async (file, relative, isDirectory) => {
      const [session, ...segments] = relative.split(path.sep);
      if (!sessions.has(session) || (!isDirectory && segments.length === 0)) {
        throw new ArchiveFailure("invalid_receipt");
      }
      if (isDirectory) checkPrivateDirectory(await fs.lstat(file));
      else
        files.push({
          path: [section, session, ...segments].join("/"),
          ...(await digestFile(file, undefined, true)),
        });
    });
  }
  files.sort(comparePaths);
  const manifest: Manifest = {
    version: 1,
    sqliteVersion,
    sessionCount: sessions.size,
    files,
    inputCaveats: [],
  };
  try {
    manifest.inputCaveats = inspectInputs(database, files, sessions, "stored");
    if (!retainedId || sha256(encodeManifest(manifest)) === retainedId)
      return manifest;
  } catch (error) {
    // An older receipt can fit even when the corrected projection expands
    // beyond the caveat budget. File and database validation already ran.
    if (
      !retainedId ||
      !(error instanceof ArchiveFailure) ||
      error.code !== "archive_limit"
    )
      throw error;
  }
  // Previously published receipts used only the bare descriptor shape. Rebuild
  // that interpretation against the same file evidence for exact verification.
  manifest.inputCaveats = inspectInputs(database, files, sessions, "bare");
  return manifest;
}

function comparePaths(a: FileEvidence, b: FileEvidence) {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

function inspectInputs(
  database: string,
  files: FileEvidence[],
  sessions: Set<string>,
  descriptorShape: "stored" | "bare"
): InputCaveat[] {
  const evidence = new Map(files.map((file) => [file.path, file]));
  const scratchSessions = new Set(
    files
      .filter((file) => file.path !== DB_NAME)
      .map((file) => file.path.split("/", 3)[1])
  );
  const caveats: InputCaveat[] = [];
  const db = new DatabaseSync(database, { readOnly: true });
  try {
    db.exec("PRAGMA trusted_schema = OFF");
    let descriptors = 0;
    const rows = db.prepare(`SELECT id, session_id, type,
      CASE WHEN length(CAST(data_json AS BLOB)) <= ? THEN data_json ELSE NULL END AS data
      FROM chat_parts WHERE type IN (?, ?) ORDER BY id`);
    for (const row of rows.iterate(
      MAX_DESCRIPTOR_BYTES,
      FILE_ATTACHMENTS,
      TEMPLATE_SELECTION
    )) {
      if (++descriptors > MAX_ENTRIES)
        throw new ArchiveFailure("archive_limit");
      const { id, session_id, type, data } = row;
      if (
        typeof id !== "string" ||
        id.length > 128 ||
        typeof session_id !== "string" ||
        !sessions.has(session_id) ||
        (type !== FILE_ATTACHMENTS && type !== TEMPLATE_SELECTION)
      ) {
        throw new ArchiveFailure("invalid_database");
      }
      const payload = parseDescriptor(
        data,
        descriptorShape === "stored" ? type : undefined
      );
      if (type === TEMPLATE_SELECTION) {
        if (payload?.bundle_location !== "scratch") {
          caveats.push({ partId: id, reason: "invalid_descriptor" });
        } else {
          // Legacy rows describe the bundle without an exact member list.
          const reason = scratchSessions.has(session_id)
            ? "template_members_unknown"
            : "template_scratch_missing";
          caveats.push({ partId: id, reason });
        }
        continue;
      }
      if (
        payload?.location !== "scratch" ||
        !Array.isArray(payload.files) ||
        payload.files.length > 64
      ) {
        caveats.push({ partId: id, reason: "invalid_descriptor" });
        continue;
      }
      for (const file of payload.files) {
        if (caveats.length >= MAX_ENTRIES)
          throw new ArchiveFailure("archive_limit");
        const name: unknown = file?.path;
        const size: unknown = file?.size;
        if (
          typeof name !== "string" ||
          name.length > 255 ||
          !safeSegment(name) ||
          typeof size !== "number" ||
          !Number.isSafeInteger(size) ||
          size < 0
        ) {
          caveats.push({ partId: id, reason: "invalid_descriptor" });
          continue;
        }
        const primary = evidence.get(`scratch/${session_id}/${name}`);
        const historical = evidence.get(`scratch-srt/${session_id}/${name}`);
        let reason: InputCaveat["reason"] | undefined;
        if (primary && historical && primary.sha256 !== historical.sha256)
          reason = "scratch_candidates_differ";
        else if (!primary && !historical) reason = "missing";
        else if (primary?.size !== size && historical?.size !== size)
          reason = "size_changed";
        else if (!primary) reason = "historical_scratch_candidate";
        if (reason) caveats.push({ partId: id, path: name, reason });
      }
    }
  } finally {
    db.close();
  }
  return caveats;
}

function parseDescriptor(
  value: unknown,
  expectedType?: string
): Record<string, unknown> | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed)) return undefined;
    if (
      expectedType &&
      (Object.hasOwn(parsed, "type") || Object.hasOwn(parsed, "data"))
    )
      return parsed.type === expectedType && isRecord(parsed.data)
        ? parsed.data
        : undefined;
    return parsed;
  } catch {
    /* The original malformed value remains in SQLite. */
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function verifyArchive(parent: string, id: string): Promise<Receipt> {
  const directory = path.join(parent, id);
  checkPrivateDirectory(await fs.lstat(directory));
  const existing = await digestFile(
    path.join(directory, MANIFEST_NAME),
    undefined,
    true
  );
  if (existing.sha256 !== id) throw new ArchiveFailure("invalid_receipt");
  const manifest = await inspectArchive(directory, id);
  const encoded = encodeManifest(manifest);
  if (sha256(encoded) !== id || existing.size !== encoded.byteLength) {
    throw new ArchiveFailure("invalid_receipt");
  }
  return archiveReceipt(directory, id, manifest);
}

function archiveReceipt(
  directory: string,
  id: string,
  manifest: Manifest
): Receipt {
  return {
    id,
    directory,
    sqliteVersion: manifest.sqliteVersion,
    sessionCount: manifest.sessionCount,
    inputCaveats: manifest.inputCaveats,
  };
}

function encodeManifest(manifest: Manifest): Buffer {
  const data = Buffer.from(`${JSON.stringify(manifest)}\n`, "utf8");
  if (data.byteLength > MAX_MANIFEST_BYTES)
    throw new ArchiveFailure("archive_limit");
  return data;
}

function sha256(data: Buffer) {
  return createHash("sha256").update(data).digest("hex");
}

async function walk(
  directory: string,
  budget: ScratchBudget,
  depth: number,
  visit: (
    file: string,
    relative: string,
    isDirectory: boolean
  ) => Promise<void>,
  leave?: (relative: string) => Promise<void>,
  prefix = ""
): Promise<void> {
  if (depth > MAX_DEPTH) throw new ArchiveFailure("archive_limit");
  const before = await fs.lstat(directory);
  checkSourceDirectory(before);
  const entries = await fs.opendir(directory);
  for await (const entry of entries) {
    if (++budget.entries > MAX_ENTRIES)
      throw new ArchiveFailure("archive_limit");
    if (!safeSegment(entry.name) || (!entry.isFile() && !entry.isDirectory())) {
      throw new ArchiveFailure("unsafe_source");
    }
    const relative = path.join(prefix, entry.name);
    budget.pathBytes += Buffer.byteLength(relative, "utf8");
    if (budget.pathBytes > MAX_PATH_BYTES)
      throw new ArchiveFailure("archive_limit");
    const child = path.join(directory, entry.name);
    await visit(child, relative, entry.isDirectory());
    if (entry.isDirectory())
      await walk(child, budget, depth + 1, visit, leave, relative);
  }
  if (!sameSnapshot(before, await fs.lstat(directory)))
    throw new ArchiveFailure("source_changed");
  await leave?.(prefix);
}

function safeSegment(value: string) {
  return (
    value.length > 0 &&
    value !== "." &&
    value !== ".." &&
    !/[\\/]/u.test(value) &&
    !value.includes("\0")
  );
}

async function digestFile(
  filename: string,
  output?: string,
  privateFile = false
) {
  const before = await fs.lstat(filename);
  checkSourceFile(before, privateFile);
  const input = await fs.open(filename, READ_FLAGS);
  try {
    const opened = await input.stat();
    if (!sameSnapshot(before, opened))
      throw new ArchiveFailure("source_changed");
    const destination = output ? await fs.open(output, "wx", 0o600) : undefined;
    try {
      const hash = createHash("sha256");
      let size = 0;
      for await (const chunk of input.createReadStream({ autoClose: false })) {
        size += chunk.byteLength;
        if (size > opened.size) throw new ArchiveFailure("source_changed");
        hash.update(chunk);
        await destination?.writeFile(chunk);
      }
      if (
        size !== opened.size ||
        !sameSnapshot(opened, await input.stat()) ||
        !sameSnapshot(opened, await fs.lstat(filename))
      )
        throw new ArchiveFailure("source_changed");
      await destination?.sync();
      return { size, sha256: hash.digest("hex") };
    } finally {
      await destination?.close();
    }
  } finally {
    await input.close();
  }
}

async function canonicalDirectory(value: string): Promise<string | undefined> {
  if (!path.isAbsolute(value) || path.dirname(value) === value)
    throw new ArchiveFailure("unsafe_source");
  const stat = await statIfPresent(value);
  if (!stat) return undefined;
  checkSourceDirectory(stat);
  const resolved = await fs.realpath(value);
  if (!sameIdentity(stat, await fs.lstat(resolved)))
    throw new ArchiveFailure("source_changed");
  if (process.platform !== "win32") {
    let current = path.dirname(resolved);
    for (;;) {
      const parent = await fs.lstat(current);
      if (
        !parent.isDirectory() ||
        (parent.uid !== process.geteuid?.() && parent.uid !== 0) ||
        ((parent.mode & 0o022) !== 0 && (parent.mode & 0o1000) === 0)
      ) {
        throw new ArchiveFailure("unsafe_source");
      }
      const next = path.dirname(current);
      if (current === next) break;
      current = next;
    }
  }
  return resolved;
}

function requirePrivatePlatform() {
  if (process.platform !== "darwin" && process.platform !== "linux") {
    throw new ArchiveFailure("unsupported_platform");
  }
}

async function statIfPresent(filename: string): Promise<Stats | undefined> {
  try {
    return await fs.lstat(filename);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function contains(parent: string, child: string): boolean {
  return parent === child || child.startsWith(parent + path.sep);
}

function sameIdentity(a: Stats, b: Stats) {
  return a.dev === b.dev && a.ino === b.ino;
}
function sameSnapshot(a: Stats, b: Stats) {
  return (
    sameIdentity(a, b) &&
    a.size === b.size &&
    a.mtimeMs === b.mtimeMs &&
    a.ctimeMs === b.ctimeMs
  );
}

function checkSourceDirectory(stat: Stats) {
  if (
    !stat.isDirectory() ||
    (process.platform !== "win32" &&
      (stat.uid !== process.geteuid?.() || (stat.mode & 0o022) !== 0))
  ) {
    throw new ArchiveFailure("unsafe_source");
  }
}

function checkSourceFile(stat: Stats, privateFile = false) {
  if (
    !stat.isFile() ||
    stat.nlink !== 1 ||
    stat.uid !== process.geteuid?.() ||
    (stat.mode & (privateFile ? 0o077 : 0o022)) !== 0
  ) {
    throw new ArchiveFailure(privateFile ? "unsafe_archive" : "unsafe_source");
  }
}

function checkPrivateDirectory(stat: Stats) {
  checkSourceDirectory(stat);
  if ((stat.mode & 0o077) !== 0) throw new ArchiveFailure("unsafe_archive");
}

async function makePrivateDirectory(directory: string) {
  try {
    await fs.mkdir(directory, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  checkPrivateDirectory(await fs.lstat(directory));
}

async function checkArchiveRoot(directory: string) {
  checkPrivateDirectory(await fs.lstat(directory));
  if (process.platform === "darwin") {
    const { stdout } = await promisify(execFile)(
      "/bin/ls",
      ["-lde", directory],
      {
        env: { LC_ALL: "C", LANG: "C" },
        timeout: 2_000,
        maxBuffer: 65_536,
      }
    );
    if (/^\s*\d+:.*\ballow\b/m.test(stdout))
      throw new ArchiveFailure("unsafe_archive");
  }
}

async function syncFile(filename: string) {
  const file = await fs.open(filename, READ_FLAGS);
  try {
    await file.sync();
  } finally {
    await file.close();
  }
}

async function syncDirectory(directory: string) {
  const file = await fs.open(
    directory,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
  );
  try {
    await file.sync();
  } finally {
    await file.close();
  }
}
