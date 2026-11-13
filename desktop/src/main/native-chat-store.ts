// GRIDA-SEC-004 / GRIDA-SEC-014 — native chat state stays apart from service roots.
import { createHash } from "node:crypto";
import { constants, type Stats } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { selectNativeChat } from "./agent-sidecar-supervisor";
import {
  NativeAgentChat,
  type NativeAgentChatLaunch,
} from "./native-agent-chat";
import { NativeDesktopProfile } from "./native-desktop-profile";

const STATE_DIRECTORY = NativeDesktopProfile.chatStateDirectory;
const WORKSPACES_DIRECTORY = "workspaces";
const DOCUMENTS_DIRECTORY = "documents";
// Existing stores already hold these names.
const CHECKPOINT = "cutover.json";
const PENDING = ".cutover.pending";
const DOCUMENT_KEY =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const CHECKPOINT_BYTES = 4096;
const DIGEST = /^[a-f0-9]{64}$/;

/**
 * The store's ownership record. `source` binds the store to the profile's
 * path facts. Earlier builds also wrote `archiveId`, always null in a store
 * this build accepts, and `nativeReady`, which nothing reads any more.
 */
type Checkpoint = Readonly<{
  version: 1;
  source: string;
  archiveId: null;
  nativeReady: boolean;
}>;

type Ready = Readonly<{
  chat: NativeAgentChat;
  stateDirectory: string;
}>;

type Launch = Omit<NativeAgentChatLaunch, "stateDirectory">;

/** Main-owned native chat state under the Desktop browser profile. */
export class NativeChatStore {
  private static preparing = false;
  private static prepared = false;

  private constructor(
    private readonly stateDirectory: string,
    readonly protectedPaths: readonly string[]
  ) {}

  /** Main-owned identity receipts for selected standalone documents. */
  get documentIdentitiesDirectory(): string {
    return path.join(this.stateDirectory, "document-identities");
  }

  /** Open the store of an isolated native profile. */
  static prepareFresh(): Promise<NativeChatStore> {
    return this.claim();
  }

  /** Open the store beside the ordinary browser profile. */
  static prepareOrdinary(
    protectedPaths: readonly string[]
  ): Promise<NativeChatStore> {
    return this.claim([...protectedPaths]);
  }

  private static async claim(
    ordinaryProtectedPaths?: readonly string[]
  ): Promise<NativeChatStore> {
    if (process.platform !== "darwin" && process.platform !== "linux")
      throw new Error("native_chat_store_platform_unsupported");
    if (this.preparing) throw new Error("native_chat_store_in_progress");
    if (this.prepared) throw new Error("native_chat_store_already_prepared");
    this.preparing = true;
    try {
      const prepared = await this.open(ordinaryProtectedPaths);
      this.prepared = true;
      return prepared;
    } finally {
      this.preparing = false;
    }
  }

  private static async open(
    ordinaryProtectedPaths: readonly string[] | undefined
  ): Promise<NativeChatStore> {
    const ordinary = ordinaryProtectedPaths !== undefined;
    const paths = selectNativeChat(ordinary);
    const desktop = await fs.realpath(paths.desktopUserDataPath);
    checkDirectory(await fs.lstat(desktop), false);
    const stateDirectory = path.join(desktop, STATE_DIRECTORY);
    const separate = await Promise.all(
      [
        paths.userDataPath,
        paths.legacyScratch,
        paths.providerHome,
        paths.mediaRoot,
      ].map(intendedLocation)
    );
    if (separate.some((root) => overlaps(root, stateDirectory)))
      throw new Error("native_chat_store_state_overlap");
    const sourceKey = storeSourceKey(
      ordinary
        ? [
            "ordinary-native-chat",
            desktop,
            paths.userDataPath,
            paths.providerHome,
            paths.mediaRoot,
          ]
        : [paths.userDataPath, paths.legacyScratch]
    );
    const checkpoint = await readCheckpoint(stateDirectory);
    if (checkpoint && checkpoint.source !== sourceKey)
      throw new Error("native_chat_store_source_changed");
    if (!checkpoint) {
      await ensureState(stateDirectory);
      if (!(await emptyDirectory(stateDirectory)))
        throw new Error("native_chat_store_unowned_state");
      await writeCheckpoint(stateDirectory, {
        version: 1,
        source: sourceKey,
        archiveId: null,
        nativeReady: false,
      });
    }
    return new NativeChatStore(
      stateDirectory,
      Object.freeze([desktop, ...separate, ...(ordinaryProtectedPaths ?? [])])
    );
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
    // Chats belong to the workspace. Every model connection opens the same
    // store; the host keeps each turn on the route that claimed it.
    return await this.startAt(launch, directory);
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
      throw new Error("native_chat_store_state_overlap");
  }

  private async startAt(
    launch: Launch,
    stateDirectory: string
  ): Promise<Ready> {
    const chat = await NativeAgentChat.start({ ...launch, stateDirectory });
    return { chat, stateDirectory };
  }
}

function storeSourceKey(basis: readonly string[]): string {
  return createHash("sha256").update(JSON.stringify(basis)).digest("hex");
}

async function readCheckpoint(directory: string): Promise<Checkpoint | null> {
  const state = await statIfPresent(directory);
  if (!state) return null;
  checkDirectory(state, true);
  if ((await fs.realpath(directory)) !== directory) throw unsafeState();
  const pending = path.join(directory, PENDING);
  const staged = await statIfPresent(pending);
  if (staged) {
    checkCheckpointFile(staged);
    await fs.unlink(pending);
  }
  const filename = path.join(directory, CHECKPOINT);
  const before = await statIfPresent(filename);
  if (!before) {
    if (!(await emptyDirectory(directory)))
      throw new Error("native_chat_store_unowned_state");
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
    value.archiveId !== null ||
    typeof value.nativeReady !== "boolean"
  )
    throw unsafeState();
  return {
    version: 1,
    source: value.source,
    archiveId: null,
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
  return new Error("native_chat_store_state_unsafe");
}
