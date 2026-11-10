// GRIDA-SEC-004 / GRIDA-SEC-014 — Main-owned, reviewed offline external runs.
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { clearTimeout, setTimeout } from "node:timers";
import { NativeAgentProcess } from "./native-agent-process";
import type { WorkspaceMediaGrant } from "./workspace-media-registry";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_TEXT = 64 * 1024;
const MAX_PROFILE = 64 * 1024;
const MAX_PIPE = 1024 * 1024;
const STOP_MS = 12_000;
const INSPECT_MS = 5_000;
const RUNTIME = new Set([
  "/bin",
  "/usr/bin",
  "/lib",
  "/lib64",
  "/usr/lib",
  "/usr/lib64",
]);
const EXIT = { succeeded: 0, failed: 1, cancelled: 130, uncertain: 5 } as const;

type Pin = Readonly<{ path: string; sha256: readonly number[] }>;
type DirectoryIdentity = WorkspaceMediaGrant["identity"];
type Profile = Readonly<{
  name: string;
  workspaceId: string;
  root: string;
  identity: DirectoryIdentity;
  executable: Pin;
  bubblewrap: Pin;
  arguments: readonly string[];
  runtimePaths: readonly string[];
  deadlineMs: number;
}>;
type Disposition =
  | "starting"
  | "running"
  | "not_dispatched"
  | keyof typeof EXIT;
export type NativeExternalRun = Readonly<{
  runId: string;
  disposition: Disposition;
  text: string | null;
  responseTruncated: boolean;
  cleanupVerified: boolean;
}>;
type Options = Readonly<{
  resourcesPath: string;
  privateDirectory: string;
  temporaryDirectory: string;
  profileFile: string;
  workspace(workspaceId: string): Promise<WorkspaceMediaGrant>;
}>;
type Active = {
  readonly id: string;
  readonly fingerprint: string;
  stopped: boolean;
  admission?: Promise<NativeExternalRun>;
  worker?: Worker;
  completion?: Promise<NativeExternalRun>;
};

export class NativeExternalRuns {
  private active?: Active;
  private inspection?: { id: string; result: Promise<NativeExternalRun> };
  private undrainedInspection?: Worker;
  private closed = false;
  private shutdown?: Promise<void>;

  private constructor(
    private readonly profile: Profile,
    private readonly directory: string,
    private readonly temporary: string,
    private readonly executable: string,
    private readonly helper: Pin,
    private readonly options: Options
  ) {}

  /** Compose only from a trusted launch under the application's single-instance owner. */
  static async open(options: Options): Promise<NativeExternalRuns> {
    if (process.platform !== "linux") throw failure("platform_unsupported");
    const profile = parseProfile(
      await readPrivate(options.profileFile, MAX_PROFILE)
    );
    const grant = await options.workspace(profile.workspaceId);
    requireWorkspace(profile, grant);
    await privateDirectory(options.privateDirectory);
    await privateDirectory(options.temporaryDirectory);
    if (
      overlaps(grant.root, options.privateDirectory) ||
      overlaps(grant.root, options.profileFile) ||
      [
        grant.root,
        options.privateDirectory,
        options.profileFile,
        ...grant.protected,
      ].some((location) => overlaps(location, options.temporaryDirectory))
    )
      throw failure("profile_invalid");
    const scope =
      "external-" +
      digest(
        JSON.stringify([profile.workspaceId, profile.root, profile.identity])
      );
    const directory = path.join(options.privateDirectory, scope);
    const temporary = path.join(options.temporaryDirectory, scope);
    await ensurePrivateDirectory(directory);
    await ensurePrivateDirectory(temporary);
    const executable = NativeAgentProcess.executable(options.resourcesPath);
    const helper = await packagedHelper(
      path.join(path.dirname(executable), "agent-kit-sandbox-helper")
    );
    return new NativeExternalRuns(
      profile,
      directory,
      temporary,
      executable,
      helper,
      options
    );
  }

  get selection() {
    return { workspaceId: this.profile.workspaceId, name: this.profile.name };
  }

  async start(
    id: string,
    text: string,
    requireCurrent: () => void
  ): Promise<NativeExternalRun> {
    requireId(id);
    if (this.closed) throw failure("closing");
    if (
      typeof text !== "string" ||
      !text.trim() ||
      Buffer.byteLength(text) > MAX_TEXT
    )
      throw failure("prompt_invalid");
    requireCurrent();
    const fingerprint = digest(
      JSON.stringify([this.profile, this.helper, text])
    );
    if (this.active) {
      if (this.active.id !== id) throw failure("busy");
      if (this.active.fingerprint !== fingerprint)
        throw failure("input_conflict");
      const active = this.active;
      const view = await active.admission!;
      return active.worker
        ? await (active.completion && this.active !== active
            ? active.completion
            : this.observe(id))
        : view;
    }
    const active: Active = { id, fingerprint, stopped: false };
    this.active = active;
    const admitted = this.admit(active, text, requireCurrent);
    active.admission = admitted;
    void admitted
      .finally(() => {
        if (!active.worker && this.active === active) this.active = undefined;
      })
      .catch(() => {});
    return admitted;
  }

  async latest(): Promise<NativeExternalRun | null> {
    if (this.active) return this.observe(this.active.id);
    const last = await this.lastId();
    return last ? await this.observe(last) : null;
  }

  async observe(id: string): Promise<NativeExternalRun> {
    requireId(id);
    if (this.active?.id === id)
      return empty(id, this.active.worker?.accepted ? "running" : "starting");
    if ((await this.intent(id)) === null) throw failure("run_missing");
    return this.inspect(id);
  }

  async stop(id: string): Promise<NativeExternalRun> {
    requireId(id);
    const active = this.active;
    if (active?.id !== id) return this.observe(id);
    active.stopped = true;
    active.worker?.stop();
    const drained = await bounded(
      active
        .admission!.catch(() => empty(id, "not_dispatched"))
        .then((view) => active.completion ?? view),
      STOP_MS
    );
    if (!drained) throw failure("shutdown_unverified");
    return drained;
  }

  close(): Promise<void> {
    this.closed = true;
    return (this.shutdown ??= (async () => {
      const active = this.active;
      const result = active && (await this.stop(active.id));
      if (result && !released(result)) throw failure("shutdown_unverified");
      await this.inspection?.result.catch(() => {});
      if (this.undrainedInspection) throw failure("shutdown_unverified");
      // An unstarted replacement must not hide the previous owner's state.
      const last = await this.lastId();
      if (last && last !== result?.runId && !released(await this.inspect(last)))
        throw failure("shutdown_unverified");
    })());
  }

  private async admit(
    active: Active,
    text: string,
    requireCurrent: () => void
  ) {
    const { id, fingerprint } = active;
    const existing = await this.intent(id);
    if (existing !== null) {
      if (existing !== fingerprint) throw failure("input_conflict");
      return this.inspect(id);
    }
    const previous = await this.lastId();
    if (previous && !released(await this.inspect(previous)))
      throw failure("shutdown_unverified");
    const grant = await this.options.workspace(this.profile.workspaceId);
    requireWorkspace(this.profile, grant);
    requireCurrent();
    if (this.closed || active.stopped) return empty(id, "not_dispatched");
    const profileFile = await this.stage(grant);
    await publish(this.directory, id + ".json", fingerprint);
    await publish(this.directory, "latest", id);
    const current = await this.options.workspace(this.profile.workspaceId);
    requireWorkspace(this.profile, current);
    if (
      JSON.stringify([...grant.protected].sort()) !==
      JSON.stringify([...current.protected].sort())
    )
      throw failure("workspace_changed");
    requireCurrent();
    if (this.closed || active.stopped) return empty(id, "not_dispatched");
    const worker = new Worker(
      this.executable,
      [
        "run-external",
        "--profile",
        profileFile,
        "--state-dir",
        this.directory,
        "--run-id",
        id,
        "--deadline-ms",
        String(this.profile.deadlineMs),
      ],
      id,
      text
    );
    active.worker = worker;
    active.completion = worker.exited
      .then(async (result) => {
        const finished = result && receipt(result, id, false);
        if (finished) return finished;
        // A lost or malformed pipe reply grants no authority to start again.
        return await this.inspect(id).catch(() => empty(id, "uncertain"));
      })
      .finally(() => {
        if (this.active === active) this.active = undefined;
      });
    return empty(id, "starting");
  }

  private async stage(grant: WorkspaceMediaGrant): Promise<string> {
    const data = JSON.stringify({
      version: 1,
      cwd: grant.root,
      workspaceIdentity: grant.identity,
      executable: this.profile.executable,
      arguments: this.profile.arguments,
      helper: this.helper,
      bubblewrap: this.profile.bubblewrap,
      runtimePaths: this.profile.runtimePaths,
      temporaryParent: this.temporary,
      protectedPaths: [
        ...new Set([
          ...grant.protected,
          this.options.privateDirectory,
          this.options.profileFile,
        ]),
      ].sort(),
    });
    if (Buffer.byteLength(data) > MAX_PROFILE) throw failure("profile_invalid");
    const name = "profile-" + digest(data) + ".json";
    await publish(this.directory, name, data);
    return path.join(this.directory, name);
  }

  private async intent(id: string): Promise<string | null> {
    const found = await readPrivate(
      path.join(this.directory, id + ".json"),
      64,
      true
    );
    if (found !== null && !/^[a-f0-9]{64}$/.test(found))
      throw failure("state_invalid");
    return found;
  }

  private async lastId(): Promise<string | null> {
    const id = await readPrivate(path.join(this.directory, "latest"), 36, true);
    if (id !== null && (!UUID.test(id) || (await this.intent(id)) === null))
      throw failure("state_invalid");
    return id;
  }

  private inspect(id: string): Promise<NativeExternalRun> {
    if (this.undrainedInspection) throw failure("shutdown_unverified");
    if (this.inspection) {
      if (this.inspection.id !== id) throw failure("busy");
      return this.inspection.result;
    }
    const result = this.inspectOnce(id).finally(() => {
      if (this.inspection?.result === result) this.inspection = undefined;
    });
    this.inspection = { id, result };
    return result;
  }

  private async inspectOnce(id: string): Promise<NativeExternalRun> {
    const worker = new Worker(
      this.executable,
      ["inspect-external", "--state-dir", this.directory, "--run-id", id],
      id
    );
    const result = await bounded(worker.exited, INSPECT_MS);
    if (!result) {
      // This command reads SQLite and has no peer child to drain.
      worker.terminate();
      if (!(await bounded(worker.exited, 1000))) {
        this.undrainedInspection = worker;
        void worker.exited.then(() => {
          if (this.undrainedInspection === worker)
            this.undrainedInspection = undefined;
        });
      }
      throw failure("observation_unavailable");
    }
    const observed = receipt(result, id, true);
    if (observed) return observed;
    if (result.code === 1 && result.diagnostic === "external_acp_run_missing")
      return empty(id, "not_dispatched");
    if (result.code === 1 && result.diagnostic === "store_already_owned")
      throw failure("busy");
    throw failure("observation_unavailable");
  }
}

type Exit = {
  code: number | null;
  records: readonly unknown[];
  diagnostic?: string;
};

class Worker {
  readonly exited: Promise<Exit>;
  accepted = false;
  private stopped = false;
  private readonly child: ChildProcessWithoutNullStreams;

  constructor(executable: string, args: string[], id: string, text?: string) {
    this.child = spawn(executable, args, {
      stdio: "pipe",
      shell: false,
      env: {},
    });
    let bytes = 0;
    let tail = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let invalid = false;
    const records: unknown[] = [];
    this.child.on("error", () => {
      invalid = true;
    });
    this.child.stdin.on("error", () => {
      invalid = true;
    });
    this.child.stdout.on("error", () => {
      invalid = true;
    });
    this.child.stderr.on("error", () => {
      invalid = true;
    });
    this.child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (invalid || bytes > MAX_PIPE) {
        invalid = true;
        return;
      }
      tail = Buffer.concat([tail, chunk]);
      for (let index = tail.indexOf(10); index >= 0; index = tail.indexOf(10)) {
        try {
          if (records.length >= 2) throw failure("wire_invalid");
          const next: unknown = JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(
              tail.subarray(0, index)
            )
          );
          records.push(next);
          if (records.length === 1)
            this.accepted = wireRecord(next, id)?.kind === "accepted";
          tail = tail.subarray(index + 1);
        } catch {
          invalid = true;
          return;
        }
      }
    });
    this.child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 256)
        stderr = Buffer.concat([
          stderr,
          chunk.subarray(0, 256 - stderr.length),
        ]);
    });
    this.exited = new Promise((resolve) => {
      this.child.once("close", (code) => {
        const diagnostic = /^grida-agent: ([a-z0-9_]{1,96})\n$/.exec(
          stderr.toString("utf8")
        )?.[1];
        resolve({
          code,
          records: invalid || tail.length ? [] : records,
          diagnostic,
        });
      });
    });
    this.child.stdin.end(text, "utf8");
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.child.kill("SIGTERM");
  }

  terminate() {
    this.child.kill("SIGKILL");
  }
}

function wireRecord(raw: unknown, id: string) {
  const row = object(raw);
  const driver = object(row?.driver);
  return row?.schema_version === 1 &&
    row.run_id === id &&
    row.session_id === id &&
    row.turn_id === id &&
    row.input_id === id &&
    driver?.kind === "external_acp" &&
    driver.transport === "acp_v1_stdio" &&
    driver.execution === "local_confined_process" &&
    driver.workspace_access === "read_only" &&
    driver.network === "denied" &&
    driver.input === "text" &&
    driver.observation === "retained_text_and_outcome" &&
    driver.stop === "owned_process" &&
    driver.recovery === "local_receipt"
    ? row
    : undefined;
}

function receipt(
  exit: Exit,
  id: string,
  inspect: boolean
): NativeExternalRun | undefined {
  const [first, last] = exit.records;
  const record = wireRecord(inspect ? first : last, id);
  if (!record) return;
  if (
    inspect
      ? record.kind !== "external_run" ||
        exit.code !== 0 ||
        exit.records.length !== 1
      : record.kind !== "finished" || wireRecord(first, id)?.kind !== "accepted"
  )
    return;
  const status = record.disposition;
  if (inspect && status === "not_dispatched" && record.account === null)
    return empty(id, status);
  if (typeof status !== "string" || !Object.hasOwn(EXIT, status)) return;
  const disposition = status as keyof typeof EXIT;
  if (!inspect && exit.code !== EXIT[disposition]) return;
  const account = object(record.account);
  if (!account)
    return disposition === "uncertain" && record.account === null
      ? empty(id, disposition)
      : undefined;
  const {
    text,
    cleanup_verified: cleanup,
    response_truncated: truncated,
  } = account;
  if (
    (text !== null &&
      (typeof text !== "string" || Buffer.byteLength(text) > MAX_TEXT)) ||
    typeof cleanup !== "boolean" ||
    typeof truncated !== "boolean"
  )
    return;
  return {
    runId: id,
    disposition,
    text,
    responseTruncated: truncated,
    cleanupVerified: cleanup,
  };
}

function empty(id: string, disposition: Disposition): NativeExternalRun {
  return {
    runId: id,
    disposition,
    text: null,
    responseTruncated: false,
    cleanupVerified: false,
  };
}

function released(result: NativeExternalRun) {
  return result.disposition === "not_dispatched" || result.cleanupVerified;
}

function parseProfile(source: string | null): Profile {
  const invalid = () => failure("profile_invalid");
  let profile: Record<string, unknown> | undefined;
  try {
    profile = object(JSON.parse(source ?? ""));
  } catch {
    throw invalid();
  }
  if (
    !profile ||
    profile.version !== 1 ||
    Object.keys(profile).some(
      (key) =>
        ![
          "version",
          "name",
          "workspaceId",
          "root",
          "identity",
          "executable",
          "arguments",
          "bubblewrap",
          "runtimePaths",
          "deadlineMs",
        ].includes(key)
    )
  )
    throw invalid();
  const {
    name,
    workspaceId,
    root,
    arguments: args,
    runtimePaths,
    deadlineMs,
  } = profile;
  const executable = pin(profile.executable);
  const bubblewrap = pin(profile.bubblewrap);
  const identity = directoryIdentity(profile.identity);
  if (
    typeof name !== "string" ||
    !name.trim() ||
    Buffer.byteLength(name) > 128 ||
    /\p{Cc}/u.test(name) ||
    typeof workspaceId !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(workspaceId) ||
    !absolute(root) ||
    !executable ||
    path.dirname(executable.path) !== "/usr/bin" ||
    !bubblewrap ||
    bubblewrap.path !== "/usr/bin/bwrap" ||
    !identity ||
    !Array.isArray(args) ||
    args.length > 64 ||
    args.some((arg) => typeof arg !== "string" || arg.includes("\0")) ||
    args.reduce((size, arg) => size + Buffer.byteLength(arg), 0) > 8192 ||
    !Array.isArray(runtimePaths) ||
    !runtimePaths.includes("/usr/bin") ||
    new Set(runtimePaths).size !== runtimePaths.length ||
    runtimePaths.some((entry) => !RUNTIME.has(entry)) ||
    typeof deadlineMs !== "number" ||
    !Number.isSafeInteger(deadlineMs) ||
    deadlineMs < 1 ||
    deadlineMs > 120_000
  )
    throw invalid();
  return {
    name,
    workspaceId,
    root,
    identity,
    executable,
    bubblewrap,
    arguments: args,
    runtimePaths,
    deadlineMs,
  };
}

function directoryIdentity(value: unknown): DirectoryIdentity | undefined {
  const row = object(value);
  if (!row || Object.keys(row).length !== 3) return;
  const { device, inode, birthTimeNs } = row;
  if (
    !integer(device) ||
    !integer(inode) ||
    !integer(birthTimeNs) ||
    birthTimeNs === "0"
  )
    return;
  return { device, inode, birthTimeNs };
}

function integer(value: unknown): value is string {
  return typeof value === "string" && /^(0|[1-9]\d{0,38})$/.test(value);
}

function requireWorkspace(profile: Profile, grant: WorkspaceMediaGrant) {
  if (
    grant.workspaceId !== profile.workspaceId ||
    grant.root !== profile.root ||
    grant.identity.device !== profile.identity.device ||
    grant.identity.inode !== profile.identity.inode ||
    grant.identity.birthTimeNs !== profile.identity.birthTimeNs
  )
    throw failure("workspace_changed");
}

function pin(value: unknown): Pin | undefined {
  const row = object(value);
  if (
    !row ||
    Object.keys(row).length !== 2 ||
    !absolute(row.path) ||
    !Array.isArray(row.sha256) ||
    row.sha256.length !== 32 ||
    row.sha256.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)
  )
    return;
  return { path: row.path, sha256: row.sha256 };
}

async function packagedHelper(location: string): Promise<Pin> {
  const handle = await fs.open(
    location,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
  );
  try {
    const before = await handle.stat({ bigint: true });
    if (
      !before.isFile() ||
      before.size > 64n * 1024n * 1024n ||
      (before.mode & 0o022n) !== 0n ||
      (before.mode & 0o111n) === 0n ||
      (await fs.realpath(location)) !== location
    )
      throw failure("helper_unavailable");
    const sha = createHash("sha256");
    const chunk = Buffer.alloc(64 * 1024);
    let size = 0n;
    while (size < before.size) {
      const { bytesRead } = await handle.read(
        chunk,
        0,
        Math.min(chunk.length, Number(before.size - size)),
        Number(size)
      );
      if (!bytesRead) throw failure("helper_unavailable");
      size += BigInt(bytesRead);
      sha.update(chunk.subarray(0, bytesRead));
    }
    if (
      !sameFile(before, await handle.stat({ bigint: true })) ||
      !sameFile(before, await fs.lstat(location, { bigint: true }))
    )
      throw failure("helper_unavailable");
    return { path: location, sha256: [...sha.digest()] };
  } finally {
    await handle.close();
  }
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function absolute(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Buffer.byteLength(value) <= 4096 &&
    value !== "/" &&
    path.isAbsolute(value) &&
    path.resolve(value) === value &&
    !value.includes("\0")
  );
}

function overlaps(a: string, b: string) {
  return a === b || a.startsWith(b + "/") || b.startsWith(a + "/");
}

function requireId(id: string) {
  if (typeof id !== "string" || !UUID.test(id)) throw failure("id_invalid");
}

function digest(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

function failure(code: string) {
  return new Error("native_external_" + code);
}

async function privateDirectory(directory: string) {
  if (!absolute(directory)) throw failure("state_invalid");
  const metadata = await fs.lstat(directory);
  if (
    !metadata.isDirectory() ||
    metadata.uid !== process.geteuid?.() ||
    (metadata.mode & 0o7777) !== 0o700 ||
    (await fs.realpath(directory)) !== directory
  )
    throw failure("state_invalid");
}

async function ensurePrivateDirectory(directory: string) {
  await fs
    .mkdir(directory, { mode: 0o700 })
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    });
  await privateDirectory(directory);
  await syncDirectory(path.dirname(directory));
}

async function syncDirectory(directory: string) {
  const handle = await fs.open(
    directory,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
  );
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function publish(directory: string, name: string, content: string) {
  const temporary = path.join(directory, ".pending-" + randomUUID());
  const handle = await fs.open(temporary, "wx", 0o600);
  try {
    try {
      await handle.writeFile(content);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(temporary, path.join(directory, name));
    await syncDirectory(directory);
  } finally {
    await fs.unlink(temporary).catch(() => {});
  }
}

function sameFile(
  before: Awaited<ReturnType<typeof bigintStat>>,
  after: Awaited<ReturnType<typeof bigintStat>>
) {
  return (
    before.dev === after.dev &&
    before.ino === after.ino &&
    before.size === after.size &&
    before.mtimeNs === after.mtimeNs &&
    before.ctimeNs === after.ctimeNs
  );
}

function bigintStat(location: string) {
  return fs.lstat(location, { bigint: true });
}

async function readPrivate(location: string, limit: number, absent = false) {
  if (!absolute(location)) throw failure("state_invalid");
  await privateDirectory(path.dirname(location));
  let handle;
  try {
    handle = await fs.open(
      location,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
    );
  } catch (error) {
    if (absent && (error as NodeJS.ErrnoException).code === "ENOENT")
      return null;
    throw failure("state_invalid");
  }
  try {
    const before = await handle.stat({ bigint: true });
    if (
      !before.isFile() ||
      before.uid !== BigInt(process.geteuid!()) ||
      before.nlink !== 1n ||
      (before.mode & 0o7777n) !== 0o600n ||
      before.size > BigInt(limit)
    )
      throw failure("state_invalid");
    const data = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < data.length) {
      const { bytesRead } = await handle.read(
        data,
        offset,
        data.length - offset,
        offset
      );
      if (!bytesRead) throw failure("state_invalid");
      offset += bytesRead;
    }
    if (
      !sameFile(before, await handle.stat({ bigint: true })) ||
      !sameFile(before, await bigintStat(location))
    )
      throw failure("state_invalid");
    return new TextDecoder("utf-8", { fatal: true }).decode(data);
  } finally {
    await handle.close();
  }
}

async function bounded<T>(promise: Promise<T>, duration: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), duration);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
