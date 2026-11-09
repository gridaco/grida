// GRIDA-SEC-004 — private preservation of the retired chat store and scratch.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants, type Stats } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import { setTimeout } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const DB_NAME = "sessions.db";
const ARCHIVE_NAME = "chat-archive";
const MANIFEST_NAME = "manifest.json";
const PENDING_NAME = ".pending";
const MAX_ENTRIES = 100_000;
const MAX_DEPTH = 32;
const MAX_PATH_BYTES = 16 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 32 * 1024 * 1024;
const MAX_DESCRIPTOR_BYTES = 64 * 1024;
const READ_FLAGS =
  constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
// Historical on-disk types. This reader outlives the old writer package.
const FILE_ATTACHMENTS = "data-user_file_attachments";
const TEMPLATE_SELECTION = "data-user_template_selection";

type FileEvidence = { path: string; size: number; sha256: string };
type InputCaveat = {
  partId: string;
  path?: string;
  reason:
    | "missing"
    | "size_changed"
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
  sessionCount: number;
  inputCaveats: readonly InputCaveat[];
};

/** Main-owned cutover evidence. The caller must close old chat admission, stop
 * the exact legacy writer and its scratch work, and prevent its restart for
 * the whole snapshot. SQLite's writer fence protects this snapshot; it does
 * not discover processes or authorize retirement of the source.
 */
export class LegacyChatArchive {
  private pending: Promise<Receipt | null> | undefined;
  private readonly source: { userDataPath: string; scratchBase: string };

  constructor(source: { userDataPath: string; scratchBase: string }) {
    this.source = { ...source };
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

  /** Verify a published cutoff. This does not check for later source changes. */
  async verify(id: string): Promise<Receipt> {
    try {
      if (!/^[a-f0-9]{64}$/.test(id))
        throw new ArchiveFailure("invalid_receipt");
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

  private async snapshot(): Promise<Receipt | null> {
    const userData = await canonicalDirectory(this.source.userDataPath);
    if (!userData) return null;
    const sourceDb = path.join(userData, DB_NAME);
    const databaseStat = await statIfPresent(sourceDb);
    const sidecars = await Promise.all(
      ["-wal", "-shm", "-journal"].map((suffix) =>
        statIfPresent(sourceDb + suffix)
      )
    );
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

    const guard = await acquireWriterFence(sourceDb);
    let stage: string | undefined;
    try {
      const current = await fs.lstat(sourceDb);
      if (!sameIdentity(databaseStat, current))
        throw new ArchiveFailure("source_changed");
      const parent = path.join(userData, ARCHIVE_NAME);
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
      const reader = new DatabaseSync(sourceDb, { readOnly: true });
      try {
        await backup(reader, archivedDb);
      } finally {
        reader.close();
      }
      // Make the archive independent of source or destination WAL sidecars.
      const destination = new DatabaseSync(archivedDb);
      try {
        const mode = destination.prepare("PRAGMA journal_mode = DELETE").get();
        if (mode?.journal_mode !== "delete")
          throw new ArchiveFailure("invalid_database");
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
      const { sessions } = readDatabase(archivedDb);
      const copied = scratch ? await copyScratch(scratch, stage, sessions) : [];
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
      } else {
        await fs.rename(stage, published);
        stage = undefined;
        receipt = archiveReceipt(published, id, manifest);
      }
      await syncDirectory(parent);
      await syncDirectory(userData);
      return receipt;
    } finally {
      try {
        if (stage) await fs.rm(stage, { recursive: true, force: true });
      } finally {
        guard.close();
      }
    }
  }
}

type FailureCode =
  | "unsafe_source"
  | "source_missing"
  | "source_changed"
  | "source_busy"
  | "unsupported_platform"
  | "unsafe_archive"
  | "invalid_database"
  | "unsupported_schema"
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

async function copyScratch(
  scratch: string,
  stage: string,
  sessions: Set<string>
): Promise<FileEvidence[]> {
  const sessionsRoot = path.join(scratch, "sessions");
  const root = await statIfPresent(sessionsRoot);
  if (!root) return [];
  checkSourceDirectory(root);
  const destination = path.join(stage, "scratch");
  await makePrivateDirectory(destination);
  const budget = { entries: 0, pathBytes: 0 };
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
            path: ["scratch", id, ...relative.split(path.sep)].join("/"),
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

async function inspectArchive(directory: string): Promise<Manifest> {
  checkPrivateDirectory(await fs.lstat(directory));
  const entries = await fs.opendir(directory);
  for await (const entry of entries) {
    if (![DB_NAME, "scratch", MANIFEST_NAME].includes(entry.name)) {
      throw new ArchiveFailure("invalid_receipt");
    }
  }
  const database = path.join(directory, DB_NAME);
  const files: FileEvidence[] = [
    { path: DB_NAME, ...(await digestFile(database, undefined, true)) },
  ];
  const { sqliteVersion, sessions } = readDatabase(database);
  const scratch = path.join(directory, "scratch");
  if (await statIfPresent(scratch)) {
    await walk(
      scratch,
      { entries: 0, pathBytes: 0 },
      0,
      async (file, relative, isDirectory) => {
        const [session, ...segments] = relative.split(path.sep);
        if (!sessions.has(session) || (!isDirectory && segments.length === 0)) {
          throw new ArchiveFailure("invalid_receipt");
        }
        if (isDirectory) checkPrivateDirectory(await fs.lstat(file));
        else
          files.push({
            path: ["scratch", session, ...segments].join("/"),
            ...(await digestFile(file, undefined, true)),
          });
      }
    );
  }
  files.sort(comparePaths);
  const inputCaveats = inspectInputs(database, files, sessions);
  return {
    version: 1,
    sqliteVersion,
    sessionCount: sessions.size,
    files,
    inputCaveats,
  };
}

function comparePaths(a: FileEvidence, b: FileEvidence) {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

function inspectInputs(
  database: string,
  files: FileEvidence[],
  sessions: Set<string>
): InputCaveat[] {
  const sizes = new Map(files.map(({ path, size }) => [path, size]));
  const scratchSessions = new Set(
    files.flatMap((file) =>
      file.path.startsWith("scratch/") ? [file.path.split("/", 3)[1]] : []
    )
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
        !sessions.has(session_id)
      ) {
        throw new ArchiveFailure("invalid_database");
      }
      const payload = parseDescriptor(data);
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
        const actual = sizes.get(`scratch/${session_id}/${name}`);
        if (actual === undefined)
          caveats.push({ partId: id, path: name, reason: "missing" });
        else if (actual !== size)
          caveats.push({ partId: id, path: name, reason: "size_changed" });
      }
    }
  } finally {
    db.close();
  }
  return caveats;
}

function parseDescriptor(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* The original malformed value remains in SQLite. */
  }
}

async function verifyArchive(parent: string, id: string): Promise<Receipt> {
  const directory = path.join(parent, id);
  checkPrivateDirectory(await fs.lstat(directory));
  const manifest = await inspectArchive(directory);
  const encoded = encodeManifest(manifest);
  const existing = await digestFile(
    path.join(directory, MANIFEST_NAME),
    undefined,
    true
  );
  if (
    sha256(encoded) !== id ||
    existing.sha256 !== id ||
    existing.size !== encoded.byteLength
  ) {
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
  budget: { entries: number; pathBytes: number },
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
