// GRIDA-SEC-004 / GRIDA-SEC-014 — cold-start ownership and private chat cutoff.
import { createHash } from "node:crypto";
import { constants, type Stats } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { sealLegacyChatForColdStart } from "./agent-sidecar-supervisor";
import {
  LegacyChatArchive,
  type HistoricalScratchWitness,
} from "./legacy-chat-archive";
import {
  LegacyChatSourceLease,
  type LegacyChatWriterAdmission,
} from "./legacy-chat-source-lease";
import {
  NativeAgentChat,
  type NativeAgentChatLaunch,
} from "./native-agent-chat";

const STATE_DIRECTORY = "native-chat";
const WORKSPACES_DIRECTORY = "workspaces";
const DOCUMENTS_DIRECTORY = "documents";
const CHECKPOINT = "cutover.json";
const PENDING = ".cutover.pending";
const DOCUMENT_KEY =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const CHECKPOINT_BYTES = 4096;
const DIGEST = /^[a-f0-9]{64}$/;

type Checkpoint = Readonly<{
  version: 1;
  source: string;
  archiveId: string | null;
  nativeReady: boolean;
}>;

type Ready = Readonly<{
  chat: NativeAgentChat;
  stateDirectory: string;
  archive: Awaited<ReturnType<LegacyChatArchive["snapshotQuiesced"]>>;
}>;

type Launch = Omit<NativeAgentChatLaunch, "stateDirectory">;
type HistoricalScratchEvidence = Readonly<
  Parameters<LegacyChatWriterAdmission>[0] & {
    witness: HistoricalScratchWitness;
  }
>;
export type ExistingCutoff = Readonly<{
  verifyWriterAdmission: LegacyChatWriterAdmission;
  requireDrainedClaim?: true;
  /** Captured by the trusted owner of the exact historical launch and drain. */
  historicalScratch?: HistoricalScratchEvidence;
  credentialHome?: string;
}>;

export class NativeAgentCutover {
  private static preparing = false;
  private static prepared = false;
  private publication: Promise<void> | undefined;

  private constructor(
    private readonly stateDirectory: string,
    private readonly checkpoint: Checkpoint,
    readonly archive: Ready["archive"],
    readonly protectedPaths: readonly string[],
    private readonly verifyCutoff?: () => Promise<void>,
    private readonly legacyArchive?: LegacyChatArchive
  ) {}

  /** Verify the shared legacy cutoff before starting any workspace engine. */
  static prepare(existing: ExistingCutoff): Promise<NativeAgentCutover> {
    return this.claim({
      ...existing,
      historicalScratch: existing.historicalScratch && {
        ...existing.historicalScratch,
        witness: { ...existing.historicalScratch.witness },
      },
    });
  }

  /** Admit an isolated native profile without claiming an existing-data cutoff. */
  static prepareFresh(): Promise<NativeAgentCutover> {
    return this.claim();
  }

  static async verifyCompletedMediaOnly(
    source: Awaited<ReturnType<typeof sealLegacyChatForColdStart>>,
    verifyWriterAdmission: LegacyChatWriterAdmission
  ): Promise<NonNullable<Ready["archive"]>> {
    if (process.platform !== "darwin")
      throw new Error("native_chat_cutover_platform_unsupported");
    const stateDirectory = path.join(
      await fs.realpath(source.desktopUserDataPath),
      STATE_DIRECTORY
    );
    const sourceKey = cutoffSourceKey([
      source.userDataPath,
      source.scratchBase,
    ]);
    const checkpoint = await readCheckpoint(stateDirectory, true);
    if (
      !checkpoint?.nativeReady ||
      !checkpoint.archiveId ||
      checkpoint.source !== sourceKey
    )
      throw new Error("native_chat_cutover_not_completed");
    const archive = await retireLegacy(
      source,
      sourceKey,
      checkpoint,
      { requireDrainedClaim: true, verifyWriterAdmission },
      new LegacyChatArchive(source),
      true
    );
    if (!archive) throw new Error("native_chat_cutover_archive_changed");
    return archive;
  }

  private static async claim(
    existing?: ExistingCutoff
  ): Promise<NativeAgentCutover> {
    if (process.platform !== "darwin" && process.platform !== "linux")
      throw new Error("native_chat_cutover_platform_unsupported");
    if (this.preparing) throw new Error("native_chat_cutover_in_progress");
    if (this.prepared) throw new Error("native_chat_cutover_already_prepared");
    this.preparing = true;
    try {
      const prepared = await this.prepareSealed(existing);
      this.prepared = true;
      return prepared;
    } finally {
      this.preparing = false;
    }
  }

  private static async prepareSealed(
    existing: ExistingCutoff | undefined
  ): Promise<NativeAgentCutover> {
    const source = await sealLegacyChatForColdStart();
    const desktop = await fs.realpath(source.desktopUserDataPath);
    checkDirectory(await fs.lstat(desktop), false);
    const stateDirectory = path.join(desktop, STATE_DIRECTORY);
    const separate = await Promise.all(
      [
        source.userDataPath,
        source.scratchBase,
        source.providerHome,
        source.mediaRoot,
        existing?.credentialHome,
      ]
        .filter((root): root is string => root !== undefined)
        .map(intendedLocation)
    );
    if (separate.some((root) => overlaps(root, stateDirectory)))
      throw new Error("native_chat_cutover_state_overlap");

    const historical = existing?.historicalScratch;
    const archive = existing
      ? new LegacyChatArchive({
          ...source,
          historicalScratch: historical?.witness,
        })
      : undefined;
    const historicalBase = archive?.historicalScratchBase;
    const basis = [source.userDataPath, source.scratchBase];
    if (historical && historicalBase) {
      if ([desktop, ...separate].some((root) => overlaps(root, historicalBase)))
        throw new Error("native_chat_cutover_historical_scratch_overlap");
      const { tempDirectoryId, scratchDirectoryId } = historical.witness;
      basis.push(
        historical.sourceId,
        historical.scratchId,
        historicalBase,
        tempDirectoryId,
        scratchDirectoryId ?? "absent"
      );
      separate.push(historicalBase);
    }
    if (!existing)
      await requireFreshSource(source.userDataPath, source.scratchBase);
    const sourceKey = cutoffSourceKey(basis);
    const previous = await readCheckpoint(stateDirectory);
    if (previous && previous.source !== sourceKey)
      throw new Error("native_chat_cutover_source_changed");
    if (!existing && previous?.archiveId)
      throw new Error("native_chat_requires_fresh_profile");
    const verifyCutoff =
      existing && archive
        ? (previous: Checkpoint | null) =>
            retireLegacy(source, sourceKey, previous, existing, archive)
        : undefined;
    const cutoff = verifyCutoff ? await verifyCutoff(previous) : null;
    let checkpoint = previous;
    if (!checkpoint) {
      await ensureState(stateDirectory);
      if (!previous && !(await emptyDirectory(stateDirectory)))
        throw new Error("native_chat_cutover_unowned_state");
      checkpoint = {
        version: 1,
        source: sourceKey,
        archiveId: cutoff?.id ?? null,
        nativeReady: false,
      };
      await writeCheckpoint(stateDirectory, checkpoint);
    }
    return new NativeAgentCutover(
      stateDirectory,
      checkpoint,
      cutoff,
      Object.freeze([desktop, ...separate]),
      verifyCutoff
        ? async () => {
            await verifyCutoff(checkpoint);
          }
        : undefined,
      archive
    );
  }

  async revealLegacyChatArchive(
    reveal: (directory: string) => void
  ): Promise<void> {
    const { archiveId } = this.checkpoint;
    const directory = this.archive?.directory;
    if (!archiveId || !directory || !this.legacyArchive)
      throw new Error("legacy_chat_archive_unavailable");
    const verified = await this.legacyArchive.verify(archiveId);
    if (verified.directory !== directory)
      throw new Error("legacy_chat_archive_unavailable");
    reveal(verified.directory);
  }

  async workspaceDirectory(
    workspaceId: string,
    cwd: string,
    prepare = false
  ): Promise<string> {
    const canonicalCwd = path.isAbsolute(cwd)
      ? await fs.realpath(cwd).catch(() => null)
      : null;
    if (
      !/^[A-Za-z0-9_-]{1,128}$/.test(workspaceId) ||
      canonicalCwd !== cwd ||
      overlaps(cwd, this.stateDirectory)
    )
      throw new Error("native_chat_workspace_invalid");
    const workspaces = path.join(this.stateDirectory, WORKSPACES_DIRECTORY);
    const key = createHash("sha256")
      .update(JSON.stringify([workspaceId, cwd]))
      .digest("hex");
    const directory = path.join(workspaces, key);
    if (prepare) {
      await ensureState(workspaces);
      await ensureState(directory);
    }
    return directory;
  }

  async startWorkspace(
    workspaceId: string,
    launch: Launch,
    profileId?: string
  ): Promise<Ready> {
    if (
      (launch.workspace && launch.workspace.id !== workspaceId) ||
      (profileId !== undefined && !DIGEST.test(profileId))
    )
      throw new Error("native_chat_workspace_invalid");
    await this.requireProviderIsolation(launch);
    const directory = await this.workspaceDirectory(
      workspaceId,
      launch.cwd,
      true
    );
    let stateDirectory = directory;
    if (profileId) {
      const profiles = path.join(directory, "profiles");
      await ensureState(profiles);
      stateDirectory = path.join(profiles, profileId);
    }
    return await this.startAt(launch, stateDirectory);
  }

  async startDocument(
    key: string,
    launch: Omit<Launch, "cwd">
  ): Promise<Ready> {
    if (
      !DOCUMENT_KEY.test(key) ||
      !launch.providerNetwork ||
      launch.workspace ||
      launch.workspaceConfiguration ||
      launch.mcp ||
      launch.processCwd ||
      launch.subagents
    )
      throw new Error("native_chat_document_invalid");
    await this.requireProviderIsolation(launch);
    const documents = path.join(this.stateDirectory, DOCUMENTS_DIRECTORY);
    const directory = path.join(documents, key);
    const cwd = path.join(directory, "context");
    const state = path.join(directory, "runtime");
    for (const location of [documents, directory, cwd, state])
      await ensureState(location);
    return await this.startAt({ ...launch, cwd, processCwd: cwd }, state);
  }

  private async requireProviderIsolation(
    launch: Pick<Launch, "credentialHome">
  ): Promise<void> {
    if (
      launch.credentialHome &&
      overlaps(
        await intendedLocation(launch.credentialHome),
        this.stateDirectory
      )
    )
      throw new Error("native_chat_cutover_state_overlap");
  }

  private async startAt(
    launch: Launch,
    stateDirectory: string
  ): Promise<Ready> {
    const chat = await NativeAgentChat.start({ ...launch, stateDirectory });
    try {
      await this.markReady();
    } catch (error) {
      await chat.close();
      throw error;
    }
    return { chat, stateDirectory, archive: this.archive };
  }

  private async markReady(): Promise<void> {
    if (this.checkpoint.nativeReady) return;
    this.publication ??= this.publishReady().catch((error: unknown) => {
      this.publication = undefined;
      throw error;
    });
    await this.publication;
  }

  private async publishReady(): Promise<void> {
    await this.verifyCutoff?.();
    await writeCheckpoint(this.stateDirectory, {
      ...this.checkpoint,
      nativeReady: true,
    });
  }
}

async function retireLegacy(
  source: Awaited<ReturnType<typeof sealLegacyChatForColdStart>>,
  sourceKey: string,
  previous: Checkpoint | null,
  existing: ExistingCutoff,
  archive: LegacyChatArchive,
  verifyOnly = false
): Promise<Ready["archive"]> {
  const historical = existing.historicalScratch;
  const requestId = `desktop-native-chat-${sourceKey}`;
  let cutoff: Ready["archive"] = null;
  const lease = new LegacyChatSourceLease(source);
  const request: Parameters<LegacyChatSourceLease["retire"]>[0] = {
    requestId,
    requireDrainedClaim: existing.requireDrainedClaim,
    verifyWriterAdmission: async (identity, drainedClaimId) => {
      if (
        historical &&
        (historical.sourceId !== identity.sourceId ||
          historical.scratchId !== identity.scratchId)
      ) {
        throw new Error("native_chat_cutover_historical_scratch_mismatch");
      }
      return await existing.verifyWriterAdmission(identity, drainedClaimId);
    },
    verifyArchive: async (retained) => {
      if (previous && (!retained || retained.archiveId !== previous.archiveId))
        throw new Error("native_chat_cutover_archive_changed");
      if (retained && !retained.archiveId)
        throw new Error("native_chat_cutover_archive_changed");
      await requireDrainedCommands(source.scratchBase);
      if (!retained && archive.historicalScratchBase)
        await requireDrainedCommands(archive.historicalScratchBase, true);
      if (verifyOnly) {
        if (!retained?.archiveId)
          throw new Error("native_chat_cutover_archive_changed");
        cutoff = await archive.verifyFrozen(requestId, retained.archiveId);
      } else {
        cutoff = await archive.sealQuiesced({
          requestId,
          expectedArchiveId: retained?.archiveId ?? undefined,
          requireReadOnlySource: process.platform === "darwin",
        });
      }
      return cutoff.id;
    },
  };
  if (verifyOnly) await lease.verifyRetired(request);
  else await lease.retire(request);
  return cutoff;
}

function cutoffSourceKey(basis: readonly string[]): string {
  return createHash("sha256").update(JSON.stringify(basis)).digest("hex");
}

async function requireFreshSource(userDataPath: string, scratchBase: string) {
  for (const name of [
    "sessions.db",
    "sessions.db-wal",
    "sessions.db-shm",
    "sessions.db-journal",
    "chat-archive",
    "legacy-chat-ownership",
  ]) {
    if (await statIfPresent(path.join(userDataPath, name)))
      throw new Error("native_chat_requires_fresh_profile");
  }
  const scratch = await statIfPresent(scratchBase);
  if (
    scratch &&
    (!scratch.isDirectory() || !(await emptyDirectory(scratchBase)))
  )
    throw new Error("native_chat_requires_fresh_profile");
}

async function requireDrainedCommands(
  scratchBase: string,
  historical = false
): Promise<void> {
  if (historical) {
    const temp = path.dirname(scratchBase);
    const stat = await statIfPresent(temp);
    if (!stat) return;
    if (!stat.isDirectory() || (await fs.realpath(temp)) !== temp)
      throw new Error("native_chat_cutover_historical_scratch_unsafe");
  }
  const scratch = await statIfPresent(scratchBase);
  if (!scratch) return;
  checkDirectory(scratch, true);
  const resolved = await fs.realpath(scratchBase);
  if (historical && resolved !== scratchBase)
    throw new Error("native_chat_cutover_historical_scratch_unsafe");
  const commands = path.join(resolved, "commands");
  const metadata = await statIfPresent(commands);
  if (!metadata) return;
  checkDirectory(metadata, true);
  if (!(await emptyDirectory(commands)))
    throw new Error("legacy_chat_command_drain_unverified");
}

async function readCheckpoint(
  directory: string,
  verifyOnly = false
): Promise<Checkpoint | null> {
  const state = await statIfPresent(directory);
  if (!state) return null;
  checkDirectory(state, true);
  if ((await fs.realpath(directory)) !== directory) throw unsafeState();
  const pending = path.join(directory, PENDING);
  const staged = await statIfPresent(pending);
  if (staged) {
    checkCheckpointFile(staged);
    if (verifyOnly) throw new Error("native_chat_cutover_not_completed");
    await fs.unlink(pending);
  }
  const filename = path.join(directory, CHECKPOINT);
  const before = await statIfPresent(filename);
  if (!before) {
    if (!(await emptyDirectory(directory)))
      throw new Error("native_chat_cutover_unowned_state");
    return null;
  }
  checkCheckpointFile(before);
  const file = await fs.open(
    filename,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
  );
  try {
    const opened = await file.stat();
    checkCheckpointFile(opened);
    if (
      opened.dev !== before.dev ||
      opened.ino !== before.ino ||
      opened.size !== before.size
    )
      throw unsafeState();
    const bytes = Buffer.alloc(CHECKPOINT_BYTES + 1);
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    if (bytesRead !== opened.size) throw unsafeState();
    return parseCheckpoint(bytes.subarray(0, bytesRead));
  } finally {
    await file.close();
  }
}

function parseCheckpoint(bytes: Uint8Array): Checkpoint {
  let value: Partial<Checkpoint> | null;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw unsafeState();
  }
  if (
    !value ||
    value.version !== 1 ||
    typeof value.source !== "string" ||
    !DIGEST.test(value.source) ||
    (value.archiveId !== null &&
      (typeof value.archiveId !== "string" || !DIGEST.test(value.archiveId))) ||
    typeof value.nativeReady !== "boolean"
  )
    throw unsafeState();
  return {
    version: 1,
    source: value.source,
    archiveId: value.archiveId,
    nativeReady: value.nativeReady,
  };
}

async function ensureState(directory: string): Promise<void> {
  try {
    await fs.mkdir(directory, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  checkDirectory(await fs.lstat(directory), true);
  if ((await fs.realpath(directory)) !== directory) throw unsafeState();
  // Make the directory entry durable before publishing a marker inside it.
  await syncDirectory(path.dirname(directory));
}

async function writeCheckpoint(
  directory: string,
  record: Checkpoint
): Promise<void> {
  const staging = path.join(directory, PENDING);
  const file = await fs.open(staging, "wx", 0o600);
  let published = false;
  try {
    try {
      await file.writeFile(JSON.stringify(record));
      await file.sync();
    } finally {
      await file.close();
    }
    await fs.rename(staging, path.join(directory, CHECKPOINT));
    published = true;
    await syncDirectory(directory);
  } finally {
    if (!published) await fs.unlink(staging).catch(() => undefined);
  }
}

async function syncDirectory(directory: string): Promise<void> {
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

async function intendedLocation(value: string): Promise<string> {
  if (!path.isAbsolute(value)) throw unsafeState();
  let current = path.resolve(value);
  const tail: string[] = [];
  for (;;) {
    try {
      return path.join(await fs.realpath(current), ...tail);
    } catch (error) {
      const parent = path.dirname(current);
      if (
        (error as NodeJS.ErrnoException).code !== "ENOENT" ||
        parent === current
      )
        throw unsafeState();
      tail.unshift(path.basename(current));
      current = parent;
    }
  }
}

function overlaps(left: string, right: string): boolean {
  return within(left, right) || within(right, left);
}

function within(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return (
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

async function emptyDirectory(directory: string): Promise<boolean> {
  const entries = await fs.opendir(directory);
  try {
    return (await entries.read()) === null;
  } finally {
    await entries.close();
  }
}

async function statIfPresent(filename: string): Promise<Stats | undefined> {
  try {
    return await fs.lstat(filename);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function checkDirectory(stat: Stats, privateDirectory: boolean): void {
  if (
    !stat.isDirectory() ||
    stat.uid !== process.geteuid?.() ||
    (privateDirectory
      ? (stat.mode & 0o7777) !== 0o700
      : (stat.mode & 0o022) !== 0)
  )
    throw unsafeState();
}

function checkCheckpointFile(stat: Stats): void {
  if (
    !stat.isFile() ||
    stat.uid !== process.geteuid?.() ||
    stat.nlink !== 1 ||
    (stat.mode & 0o7777) !== 0o600 ||
    stat.size > CHECKPOINT_BYTES
  )
    throw unsafeState();
}

function unsafeState(): Error {
  return new Error("native_chat_cutover_state_unsafe");
}
