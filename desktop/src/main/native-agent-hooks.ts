// GRIDA-SEC-004 / GRIDA-SEC-014 — explicitly reviewed executable hooks in private Main state.
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { atomicWrite } from "@grida/daemon/server";
import { parse as parseToml } from "smol-toml";
import type { NativeWorkspaceSelection } from "./native-agent-permissions";
import type {
  NativeGlobalHookInspection,
  NativeHookEvent,
  NativeHookInfo,
  NativeHookInspection,
  NativeHookResult,
} from "@grida/desktop-bridge";

const EVENTS: readonly NativeHookEvent[] = [
  "session_start",
  "before_input",
  "before_tool",
  "after_tool",
  "before_completion",
];
const MAX_FILE = 64 * 1024;
const MAX_EXECUTABLE = 128 * 1024 * 1024;
const execute = promisify(execFile);
const reviews = new WeakMap<
  object,
  { owner: NativeAgentHooks; captured: Stored }
>();
const writes = new Map<string, Promise<unknown>>();
type Pin = { path: string; sha256: number[] };
type Definition = Omit<NativeHookInfo, "executable" | "revision"> & {
  executable: Pin;
};
type Stored = Definition & { revision: string };
export type NativeHookLaunchProfile = Readonly<{
  hooks: readonly Definition[];
  command: Readonly<{
    helper: Pin;
    bubblewrap?: Pin;
    runtimePaths: readonly string[];
    temporaryParent: string;
    hooksOnly: true;
  }>;
}>;
export type NativeHookReview = Readonly<{
  definition: NativeHookInfo;
  workspace: string;
}>;

/** Trusted registration is distinct from the immutable selection of a live worker. */
export class NativeAgentHooks {
  static readonly capabilities = { "co.grida/session/hooks": 1 } as const;
  private launchContext?: {
    resources: string;
    workspace: NativeWorkspaceSelection;
  };
  private constructor(
    private readonly directory: string,
    private readonly workspace: string,
    private readonly selected: readonly Stored[]
  ) {}

  static async open(
    directory: string,
    workspace: string
  ): Promise<NativeAgentHooks> {
    if (!path.isAbsolute(directory) || path.normalize(directory) !== directory)
      throw invalid();
    if (
      !path.isAbsolute(workspace) ||
      (await fs.realpath(workspace)) !== workspace
    )
      throw invalid();
    const owner = new NativeAgentHooks(directory, workspace, []);
    try {
      return new NativeAgentHooks(directory, workspace, await owner.read());
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "native_hooks_review_required"
      )
        throw error;
      throw new Error("native_hooks_configuration_invalid");
    }
  }

  /** Settings owns global source inspection; no workspace registry is read. */
  static settings(directory: string): NativeAgentHooks {
    if (!path.isAbsolute(directory) || path.normalize(directory) !== directory)
      throw invalid();
    return new NativeAgentHooks(directory, "", []);
  }

  get configPath(): string {
    return path.join(this.directory, "config.toml");
  }

  async configuration(): Promise<NativeGlobalHookInspection> {
    try {
      const source = await this.readSource();
      const trusted = await this.trustedRevisions();
      return {
        configPath: this.configPath,
        exists: source.exists,
        hooks: source.hooks.map((hook) => ({
          ...info(hook),
          trusted: trusted.has(hook.revision),
        })),
        diagnostics: [],
        activation: "new_connections",
      };
    } catch (error) {
      return {
        configPath: this.configPath,
        exists: await fs.lstat(this.configPath).then(
          () => true,
          () => false
        ),
        hooks: [],
        diagnostics: [hookDiagnostic(error)],
        activation: "new_connections",
      };
    }
  }

  async reviewConfigured(
    id: string,
    revision: string
  ): Promise<NativeHookReview> {
    const source = await this.readSource();
    const captured = source.hooks.find(
      (hook) => hook.id === id && hook.revision === revision
    );
    if (!captured) throw new Error("native_hook_revision_changed");
    const review = Object.freeze({
      definition: info(captured),
      workspace: "All workspaces",
    });
    reviews.set(review, { owner: this, captured });
    return review;
  }

  async trust(review: NativeHookReview): Promise<void> {
    const issued = reviews.get(review);
    if (!issued || issued.owner !== this)
      throw new Error("native_hook_review_unavailable");
    reviews.delete(review);
    const previous = writes.get(this.directory) ?? Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(async () => {
        // Re-read the sole source and pin after the person reviewed it. No stale
        // dialog may bless a different command or a replaced executable.
        const current = (await this.readSource()).hooks;
        if (!current.some((hook) => hook.revision === issued.captured.revision))
          throw new Error("native_hook_revision_changed");
        await verifyPin(issued.captured.executable, true);
        const trusted = await this.trustedRevisions();
        trusted.add(issued.captured.revision);
        const receiptDirectory = path.join(this.directory, "agent");
        await fs.mkdir(receiptDirectory, { mode: 0o700, recursive: true });
        await sourceDirectory(receiptDirectory);
        await atomicWrite(
          path.join(receiptDirectory, "hooks-trust.json"),
          JSON.stringify({ version: 1, revisions: [...trusted].slice(-64) }),
          { mode: 0o600, ensure_dir: false }
        );
      });
    writes.set(this.directory, next);
    try {
      await next;
    } finally {
      if (writes.get(this.directory) === next) writes.delete(this.directory);
    }
  }

  /** Retired workspace JSON/import mutation paths never change global state. */
  async review(_file: string): Promise<NativeHookReview> {
    throw new Error("native_hooks_config_toml_only");
  }
  async install(_review: NativeHookReview): Promise<void> {
    throw new Error("native_hooks_config_toml_only");
  }
  async remove(_id: string, _revision: string): Promise<void> {
    throw new Error("native_hooks_config_toml_only");
  }

  /** Create the editable global file, without executing or trusting any hook. */
  async ensureConfig(): Promise<string> {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    await sourceDirectory(this.directory);
    try {
      await fs.writeFile(
        this.configPath,
        "schema_version = 1\n\n# Configure global hooks with [[hooks]].\n",
        { flag: "wx", mode: 0o600 }
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    await boundedFile(this.configPath, MAX_FILE, false, false, false, true);
    return this.configPath;
  }

  async inspect(active: unknown): Promise<NativeHookInspection> {
    const value = record(active);
    if (
      !Array.isArray(value.supportedEvents) ||
      value.supportedEvents.length > EVENTS.length ||
      value.supportedEvents.some(
        (event) => !EVENTS.includes(event as NativeHookEvent)
      ) ||
      !Array.isArray(value.hooks) ||
      value.hooks.length > 8 ||
      !Array.isArray(value.results) ||
      value.results.length > 64
    )
      throw protocol();
    const hooks = value.hooks.map(readInfo);
    const results = value.results.map(readResult);
    let saved = this.selected;
    let sourceInvalid = false;
    try {
      saved = (await this.readSource()).hooks;
    } catch {
      // An invalid future configuration cannot hide a live task's captured
      // policy or retained results. Settings owns the source diagnostic.
      sourceInvalid = true;
    }
    return Object.freeze({
      supportedEvents: [...value.supportedEvents] as NativeHookEvent[],
      active: hooks,
      saved: saved.map(info),
      results,
      activation:
        !sourceInvalid &&
        JSON.stringify(saved) === JSON.stringify(this.selected)
          ? "current"
          : "restart_required",
    });
  }

  /** Only the captured selection enters a worker; a registry write cannot change it. */
  async launch(
    resources: string,
    workspace?: NativeWorkspaceSelection
  ): Promise<NativeHookLaunchProfile | undefined> {
    if (workspace) {
      if (workspace.primary.path !== this.workspace) throw invalid();
      this.launchContext = { resources, workspace };
    }
    return this.plan(resources, this.selected);
  }

  private async plan(
    resources: string,
    selected: readonly Stored[]
  ): Promise<NativeHookLaunchProfile | undefined> {
    const hooks = selected.filter((hook) => hook.enabled);
    if (!hooks.length) return undefined;
    if (process.platform !== "darwin" && process.platform !== "linux")
      throw new Error("native_hooks_platform_unsupported");
    const helper = await pin(
      path.join(resources, "native-agent", "agent-kit-sandbox-helper")
    );
    const runtime =
      process.platform === "darwin"
        ? ["/usr/bin", "/bin", "/usr/lib", "/System/Library"]
        : ["/usr/bin", "/bin", "/usr/lib", "/lib", "/lib64"];
    const runtimePaths = new Set<string>();
    for (const root of runtime) {
      try {
        runtimePaths.add(await fs.realpath(root));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    for (const hook of hooks) {
      // Keep the reviewed pin when its program is unavailable. Native admission
      // records that failure; inspection and Stop must remain usable.
      runtimePaths.add(hook.executable.path);
    }
    const temporaryParent = path.join(
      await commandTemporaryRoot(),
      `grida-agent-hooks-${digest([this.directory, this.workspace]).slice(0, 24)}`
    );
    if (overlaps(temporaryParent, this.workspace))
      throw new Error("native_hook_temporary_scope_invalid");
    await fs.mkdir(temporaryParent, { mode: 0o700 }).catch((error) => {
      if (error.code !== "EEXIST") throw error;
    });
    await privateDirectory(temporaryParent);
    return {
      hooks: hooks.map(({ revision: _revision, ...definition }) => definition),
      command: {
        helper,
        ...(process.platform === "linux"
          ? { bubblewrap: await pin("/usr/bin/bwrap") }
          : {}),
        runtimePaths: [...runtimePaths],
        temporaryParent,
        hooksOnly: true,
      },
    };
  }

  private capture(value: unknown): Stored {
    const hook = record(value);
    const executable = record(hook.executable);
    if (
      Object.keys(hook).some(
        (key) =>
          ![
            "id",
            "source",
            "event",
            "tool",
            "enabled",
            "executable",
            "arguments",
            "mode",
            "timeoutMs",
            "revision",
          ].includes(key)
      ) ||
      !identifier(hook.id) ||
      typeof hook.source !== "string" ||
      !hook.source.length ||
      Buffer.byteLength(hook.source) > 256 ||
      [...hook.source].some((character) => character.charCodeAt(0) < 32) ||
      !EVENTS.includes(hook.event as NativeHookEvent) ||
      typeof hook.enabled !== "boolean" ||
      !["required", "observe"].includes(hook.mode as string) ||
      !Number.isSafeInteger(hook.timeoutMs) ||
      (hook.timeoutMs as number) < 1 ||
      (hook.timeoutMs as number) > 30000 ||
      !Array.isArray(hook.arguments) ||
      hook.arguments.length > 64 ||
      hook.arguments.some(
        (argument) => typeof argument !== "string" || argument.includes("\0")
      ) ||
      (hook.arguments as string[]).reduce(
        (size, argument) => size + Buffer.byteLength(argument),
        0
      ) > 8192 ||
      (hook.tool !== undefined &&
        (!identifier(hook.tool) ||
          !["before_tool", "after_tool"].includes(hook.event as string))) ||
      Object.keys(executable).some(
        (key) => key !== "path" && key !== "sha256"
      ) ||
      typeof executable.path !== "string" ||
      !path.isAbsolute(executable.path) ||
      !Array.isArray(executable.sha256) ||
      executable.sha256.length !== 32 ||
      !executable.sha256.every(
        (byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255
      )
    )
      throw invalid();
    const definition: Definition = {
      id: hook.id as string,
      source: hook.source,
      event: hook.event as NativeHookEvent,
      ...(hook.tool !== undefined ? { tool: hook.tool as string } : {}),
      enabled: hook.enabled,
      mode: hook.mode as "required" | "observe",
      executable: {
        path: executable.path,
        sha256: [...executable.sha256] as number[],
      },
      arguments: [...hook.arguments] as string[],
      timeoutMs: hook.timeoutMs as number,
    };
    return {
      ...definition,
      revision: digest(["global-config-v1", definition]),
    };
  }

  private async read(): Promise<Stored[]> {
    const { hooks } = await this.readSource();
    const trusted = await this.trustedRevisions();
    if (hooks.some((hook) => hook.enabled && !trusted.has(hook.revision)))
      throw new Error("native_hooks_review_required");
    return hooks;
  }

  private async readSource(): Promise<{ exists: boolean; hooks: Stored[] }> {
    try {
      await sourceDirectory(this.directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return { exists: false, hooks: [] };
      throw error;
    }
    let bytes: Buffer;
    try {
      bytes = await boundedFile(
        this.configPath,
        MAX_FILE,
        false,
        false,
        false,
        true
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return { exists: false, hooks: [] };
      throw error;
    }
    let value: Record<string, unknown>;
    try {
      value = record(
        parseToml(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
      );
    } catch {
      throw new Error("native_hooks_toml_invalid");
    }
    if (
      Object.keys(value).some(
        (key) => !["schema_version", "hooks"].includes(key)
      ) ||
      value.schema_version !== 1 ||
      (value.hooks !== undefined && !Array.isArray(value.hooks))
    )
      throw new Error("native_hooks_schema_invalid");
    const entries = value.hooks ?? [];
    if (!Array.isArray(entries) || entries.length > 8)
      throw new Error("native_hooks_count_invalid");
    const hooks: Stored[] = [];
    for (const entry of entries) {
      const draft = record(entry);
      if (
        Object.keys(draft).some(
          (key) =>
            ![
              "id",
              "event",
              "tool",
              "enabled",
              "executable",
              "arguments",
              "mode",
              "timeout_ms",
            ].includes(key)
        ) ||
        typeof draft.executable !== "string"
      )
        throw new Error("native_hooks_fields_invalid");
      if (!EVENTS.includes(draft.event as NativeHookEvent))
        throw new Error("native_hooks_event_invalid");
      if (
        !Number.isSafeInteger(draft.timeout_ms) ||
        (draft.timeout_ms as number) < 1 ||
        (draft.timeout_ms as number) > 30000
      )
        throw new Error("native_hooks_timeout_invalid");
      let executable: Pin;
      try {
        executable = await pin(draft.executable, true);
      } catch {
        throw new Error("native_hooks_executable_invalid");
      }
      hooks.push(
        this.capture({
          id: draft.id,
          event: draft.event,
          ...(draft.tool !== undefined && { tool: draft.tool }),
          source: this.configPath,
          enabled: draft.enabled ?? true,
          mode: draft.mode,
          executable,
          arguments: draft.arguments,
          timeoutMs: draft.timeout_ms,
        })
      );
    }
    if (new Set(hooks.map((hook) => hook.id)).size !== hooks.length)
      throw new Error("native_hooks_id_duplicate");
    return { exists: true, hooks };
  }

  private async trustedRevisions(): Promise<Set<string>> {
    const directory = path.join(this.directory, "agent");
    let bytes: Buffer;
    try {
      await sourceDirectory(directory);
      bytes = await boundedFile(
        path.join(directory, "hooks-trust.json"),
        MAX_FILE,
        true
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Set();
      throw error;
    }
    const value = record(parse(bytes));
    if (
      Object.keys(value).some(
        (key) => !["version", "revisions"].includes(key)
      ) ||
      value.version !== 1 ||
      !Array.isArray(value.revisions) ||
      value.revisions.length > 64 ||
      value.revisions.some(
        (revision) =>
          typeof revision !== "string" || !/^[a-f0-9]{64}$/.test(revision)
      )
    )
      throw invalid();
    return new Set(value.revisions as string[]);
  }
}

async function pin(location: string, system = false): Promise<Pin> {
  if (!path.isAbsolute(location) || location.includes("\0")) throw invalid();
  const canonical = await fs.realpath(location);
  const data = await boundedFile(
    canonical,
    MAX_EXECUTABLE,
    false,
    true,
    system
  );
  if (system) {
    await noAcl(canonical);
    for (
      let ancestor = path.dirname(canonical);
      ;
      ancestor = path.dirname(ancestor)
    ) {
      const stat = await fs.lstat(ancestor);
      if (!stat.isDirectory() || stat.uid !== 0 || (stat.mode & 0o022) !== 0)
        throw invalid();
      await noAcl(ancestor);
      if (ancestor === path.dirname(ancestor)) break;
    }
  }
  return {
    path: canonical,
    sha256: [...createHash("sha256").update(data).digest()],
  };
}
async function verifyPin(value: Pin, system = false): Promise<void> {
  const current = await pin(value.path, system);
  if (
    current.path !== value.path ||
    current.sha256.some((byte, index) => byte !== value.sha256[index])
  )
    throw new Error("native_hook_executable_changed");
}
async function boundedFile(
  location: string,
  maximum: number,
  privateFile: boolean,
  executable = false,
  system = false,
  userOwned = false
): Promise<Buffer> {
  const handle = await fs.open(
    location,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
  );
  try {
    const stat = await handle.stat();
    if (
      !stat.isFile() ||
      stat.size > maximum ||
      (privateFile &&
        (stat.uid !== process.geteuid?.() ||
          (stat.mode & 0o7777) !== 0o600 ||
          stat.nlink !== 1)) ||
      (userOwned &&
        (stat.uid !== process.geteuid?.() ||
          (stat.mode & 0o022) !== 0 ||
          stat.nlink !== 1)) ||
      (executable &&
        ((stat.mode & 0o022) !== 0 || (stat.mode & 0o111) === 0)) ||
      (system && stat.uid !== 0)
    )
      throw invalid();
    if (privateFile || userOwned) await noAcl(location);
    const data = Buffer.alloc(stat.size + 1);
    const { bytesRead } = await handle.read(data, 0, data.length, 0);
    const after = await handle.stat();
    if (
      bytesRead !== stat.size ||
      after.size !== stat.size ||
      after.mtimeMs !== stat.mtimeMs ||
      after.ctimeMs !== stat.ctimeMs
    )
      throw invalid();
    return data.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}
/**
 * Where private command temporary parents live: the user's temporary
 * directory, kept outside the system's shared `/tmp`. A read-write command may
 * write `/tmp`, and the sandbox refuses a launch whose temporary parent lies
 * within a writable location. Linux's default temporary directory is `/tmp`,
 * so there the parents live in `/var/tmp`.
 */
async function commandTemporaryRoot(): Promise<string> {
  const root = await fs.realpath(os.tmpdir());
  const shared = await fs.realpath("/tmp").catch(() => undefined);
  if (!shared || !overlaps(root, shared)) return root;
  const fallback = await fs.realpath("/var/tmp");
  if (overlaps(fallback, shared))
    throw new Error("native_command_temporary_root_unavailable");
  return fallback;
}
/** Global config needs integrity, not secret-directory permissions. Existing
 * Grida homes may be 0755; definitions and private receipts remain owner-writable. */
async function sourceDirectory(location: string): Promise<void> {
  const stat = await fs.lstat(location);
  if (
    !stat.isDirectory() ||
    stat.uid !== process.geteuid?.() ||
    (stat.mode & 0o022) !== 0 ||
    (await fs.realpath(location)) !== location
  )
    throw invalid();
  await noAcl(location);
}
async function privateDirectory(location: string): Promise<void> {
  const stat = await fs.lstat(location);
  if (
    !stat.isDirectory() ||
    stat.uid !== process.geteuid?.() ||
    (stat.mode & 0o7777) !== 0o700 ||
    (await fs.realpath(location)) !== location
  )
    throw invalid();
  await noAcl(location);
}
async function noAcl(location: string): Promise<void> {
  if (process.platform !== "darwin") return;
  const result = await execute("/bin/ls", ["-lde", location], {
    maxBuffer: 8192,
    env: { LC_ALL: "C", PATH: "/usr/bin:/bin" },
  });
  if (/^\s*\d+:/m.test(result.stdout)) throw invalid();
}
function info({ executable, ...value }: Stored): NativeHookInfo {
  return Object.freeze({
    ...value,
    arguments: Object.freeze([...value.arguments]),
    executable: executable.path,
  });
}
function parse(bytes: Buffer): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw invalid();
  }
}
function readInfo(value: unknown): NativeHookInfo {
  const entry = record(value);
  if (
    !identifier(entry.id) ||
    typeof entry.revision !== "string" ||
    !/^[a-f0-9]{64}$/.test(entry.revision) ||
    !EVENTS.includes(entry.event as NativeHookEvent) ||
    typeof entry.source !== "string" ||
    typeof entry.executable !== "string" ||
    !Array.isArray(entry.arguments) ||
    entry.arguments.some((argument) => typeof argument !== "string") ||
    typeof entry.enabled !== "boolean" ||
    !["required", "observe"].includes(entry.mode as string) ||
    !Number.isSafeInteger(entry.timeoutMs)
  )
    throw protocol();
  return entry as unknown as NativeHookInfo;
}
function readResult(value: unknown): NativeHookResult {
  const entry = record(value);
  if (
    !identifier(entry.id) ||
    typeof entry.revision !== "string" ||
    !EVENTS.includes(entry.event as NativeHookEvent) ||
    (entry.operation !== null && typeof entry.operation !== "string") ||
    ![
      "allowed",
      "denied",
      "failed",
      "cancelled",
      "uncertain",
      "invalid_reply",
      "unavailable",
      "deferred",
      "skipped",
    ].includes(entry.status as string) ||
    (entry.reason !== undefined &&
      entry.reason !== null &&
      typeof entry.reason !== "string")
  )
    throw protocol();
  return entry as unknown as NativeHookResult;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw invalid();
  return value as Record<string, unknown>;
}
function identifier(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_.:@/-]{1,256}$/.test(value);
}
function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function overlaps(left: string, right: string): boolean {
  return (
    left === right ||
    left.startsWith(right + path.sep) ||
    right.startsWith(left + path.sep)
  );
}
function hookDiagnostic(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  switch (code) {
    case "native_hooks_toml_invalid":
      return "config.toml is not valid UTF-8 TOML. Correct its syntax and reload.";
    case "native_hooks_schema_invalid":
      return "Use schema_version = 1 and ordered [[hooks]] tables. Other global configuration fields are not supported yet.";
    case "native_hooks_count_invalid":
      return "Configure at most eight hooks.";
    case "native_hooks_fields_invalid":
      return "A hook contains an unsupported field or is missing executable. Use id, event, executable, arguments, mode, timeout_ms, enabled and optional tool.";
    case "native_hooks_event_invalid":
      return "Hook event must be session_start, before_input, before_tool, after_tool or before_completion.";
    case "native_hooks_timeout_invalid":
      return "Hook timeout_ms must be an integer from 1 to 30000.";
    case "native_hooks_executable_invalid":
      return "Hook executable must name an available absolute system program owned by root, without non-owner write access or ACLs.";
    case "native_hooks_id_duplicate":
      return "Each hook must have a unique id.";
    default:
      return "The hook configuration or trust receipt is invalid or unsafe. Check file ownership and permissions, hook IDs, literal arguments, required/observe mode, and exact tool selection.";
  }
}
function invalid(): Error {
  return new Error("native_hook_configuration_invalid");
}
function protocol(): Error {
  return new Error("native_hook_inspection_invalid");
}

/** Shared with the native command profile: same pinning and privacy rules. */
export {
  commandTemporaryRoot,
  pin as pinExecutable,
  privateDirectory as requirePrivateDirectory,
};
