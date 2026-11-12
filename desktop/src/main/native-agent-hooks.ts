// GRIDA-SEC-004 / GRIDA-SEC-014 — explicitly reviewed executable hooks in private Main state.
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { atomicWrite } from "@grida/daemon/server";
import {
  NativeAgentPermissions,
  type NativeWorkspaceSelection,
} from "./native-agent-permissions";
import type {
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
    await privateDirectory(directory);
    if (
      !path.isAbsolute(workspace) ||
      (await fs.realpath(workspace)) !== workspace
    )
      throw invalid();
    const owner = new NativeAgentHooks(directory, workspace, []);
    return new NativeAgentHooks(directory, workspace, await owner.read());
  }

  async review(file: string): Promise<NativeHookReview> {
    const draft = record(parse(await boundedFile(file, MAX_FILE, false)));
    const allowed = [
      "id",
      "event",
      "tool",
      "enabled",
      "executable",
      "arguments",
      "mode",
      "timeoutMs",
    ];
    if (
      Object.keys(draft).some((key) => !allowed.includes(key)) ||
      typeof draft.executable !== "string"
    )
      throw invalid();
    const executable = await pin(draft.executable, true);
    if (overlaps(executable.path, this.workspace)) throw invalid();
    const captured = this.capture({
      ...draft,
      enabled: draft.enabled ?? true,
      source: `user-selected:${path.basename(file)}`,
      executable,
    });
    const review = Object.freeze({
      definition: info(captured),
      workspace: this.workspace,
    });
    reviews.set(review, { owner: this, captured });
    return review;
  }

  async install(review: NativeHookReview): Promise<void> {
    const issued = reviews.get(review);
    if (!issued || issued.owner !== this)
      throw new Error("native_hook_review_unavailable");
    reviews.delete(review);
    const captured = issued.captured;
    await this.mutate(async (current) => {
      await verifyPin(captured.executable, true);
      const next = current.filter((hook) => hook.id !== captured.id);
      if (next.length >= 8) throw new Error("native_hook_limit");
      const selected = [...next, captured];
      if (this.launchContext) {
        await NativeAgentPermissions.validateHookProfile(
          this.launchContext.workspace,
          await this.plan(this.launchContext.resources, selected)
        );
      }
      return selected;
    });
  }

  async remove(id: string, revision: string): Promise<void> {
    await this.mutate(async (current) => {
      if (!current.some((hook) => hook.id === id && hook.revision === revision))
        throw new Error("native_hook_revision_changed");
      return current.filter((hook) => hook.id !== id);
    });
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
    const saved = await this.read();
    return Object.freeze({
      supportedEvents: [...value.supportedEvents] as NativeHookEvent[],
      active: hooks,
      saved: saved.map(info),
      results,
      activation:
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
      await fs.realpath(os.tmpdir()),
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
    return { ...definition, revision: digest([this.workspace, definition]) };
  }

  private async read(): Promise<Stored[]> {
    await privateDirectory(this.directory);
    let bytes: Buffer;
    try {
      bytes = await boundedFile(
        path.join(this.directory, "hooks.json"),
        MAX_FILE,
        true
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const value = record(parse(bytes));
    if (
      Object.keys(value).some((key) => key !== "version" && key !== "hooks") ||
      value.version !== 1 ||
      !Array.isArray(value.hooks) ||
      value.hooks.length > 8
    )
      throw invalid();
    const hooks = value.hooks.map((raw) => {
      const captured = this.capture(raw);
      if (record(raw).revision !== captured.revision) throw invalid();
      return captured;
    });
    if (new Set(hooks.map((hook) => hook.id)).size !== hooks.length)
      throw invalid();
    return hooks;
  }

  private async mutate(
    change: (current: Stored[]) => Promise<Stored[]>
  ): Promise<void> {
    const previous = writes.get(this.directory) ?? Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(async () => {
        const hooks = await change(await this.read());
        const content = JSON.stringify({ version: 1, hooks });
        if (Buffer.byteLength(content) > MAX_FILE) throw invalid();
        await privateDirectory(this.directory);
        await atomicWrite(path.join(this.directory, "hooks.json"), content, {
          mode: 0o600,
          ensure_dir: false,
        });
      });
    writes.set(this.directory, next);
    try {
      await next;
    } finally {
      if (writes.get(this.directory) === next) writes.delete(this.directory);
    }
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
  system = false
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
      (executable &&
        ((stat.mode & 0o022) !== 0 || (stat.mode & 0o111) === 0)) ||
      (system && stat.uid !== 0)
    )
      throw invalid();
    if (privateFile) await noAcl(location);
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
function invalid(): Error {
  return new Error("native_hook_configuration_invalid");
}
function protocol(): Error {
  return new Error("native_hook_inspection_invalid");
}

/** Shared with the native command profile: same pinning and privacy rules. */
export { pin as pinExecutable, privateDirectory as requirePrivateDirectory };
