/**
 * GRIDA-SEC-004 — supervisor-owned, per-command shell confinement.
 *
 * AgentSidecar owns the model loop and validates the tool request, but it does
 * not spawn raw commands in Desktop. It asks Electron main over the inherited
 * private channel. Main canonicalizes one exact tenant-supplied workspace and,
 * when present, one exact session scratch root, then asks SRT for a fresh
 * kernel profile for the command's original POSIX process group.
 *
 * The long-lived sidecar's outer profile is intentionally too coarse for this
 * job: one sidecar serves many sessions, so a child that merely inherits that
 * profile can read a sibling session's scratch. Per-command deny/allow carving
 * is the security boundary; argv inspection remains only defense in depth.
 */
import fs from "node:fs/promises";
import path from "node:path";
import {
  containsPath,
  runShell,
  type ShellExecutionScope,
  type ShellExecutor,
  type ShellRunOptions,
  type ShellRunRequest,
  type ShellRunResult,
} from "@grida/daemon/server";
import type { SandboxRuntimeConfig } from "@anthropic-ai/sandbox-runtime";
import { cleanupAfterCommand, wrapArgv } from "./sandbox/manager";

const PRIVATE_DIR_MODE = 0o700;
const SHARED_SRT_TMP_DIRS = ["/tmp/claude", "/private/tmp/claude"] as const;
const COMMANDS_DIRNAME = "commands";

type FilesystemPolicy = Readonly<{
  deny_read: readonly string[];
  deny_write: readonly string[];
}>;

type WrappedCommand = Readonly<{
  argv: string[];
  env: NodeJS.ProcessEnv;
}>;

export type AgentCommandHostOptions = Readonly<{
  scratchBase: string;
  userData: string;
  mediaRoot: string;
  home: string;
  filesystemPolicy: FilesystemPolicy;
  wrap?: (
    command: string,
    customConfig: Partial<SandboxRuntimeConfig>,
    abortSignal?: AbortSignal
  ) => Promise<WrappedCommand>;
  run?: (
    request: ShellRunRequest,
    options?: ShellRunOptions
  ) => Promise<ShellRunResult>;
  cleanup?: () => void;
}>;

/**
 * Reclaim command-temp remnants from a prior crashed host. The caller must
 * first establish the scratch base as a trusted, owner-only non-symlink
 * authority with `prepareScratchAuthority`.
 */
export async function sweepAgentCommandTemps(
  scratchBase: string
): Promise<void> {
  const commands = path.join(path.resolve(scratchBase), COMMANDS_DIRNAME);
  let stat;
  try {
    stat = await fs.lstat(commands);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    await fs.unlink(commands);
    return;
  }
  assertCurrentOwner(commands, stat);
  await fs.rm(commands, { recursive: true, force: true });
}

/**
 * The only raw-command executor Desktop injects into the agent tenant.
 *
 * The public function identity is stable so it can be handed directly to
 * `createAgentDaemon({ shell_executor })`; all mutable state remains
 * private to this main-process object.
 */
export class AgentCommandHost {
  readonly shellExecutor: ShellExecutor;

  private readonly scratchBase: string;
  private readonly userData: string;
  private readonly mediaRoot: string;
  private readonly home: string;
  private readonly filesystemPolicy: FilesystemPolicy;
  private readonly wrapCommand: NonNullable<AgentCommandHostOptions["wrap"]>;
  private readonly runCommand: NonNullable<AgentCommandHostOptions["run"]>;
  private readonly cleanupCommand: NonNullable<
    AgentCommandHostOptions["cleanup"]
  >;

  constructor(options: AgentCommandHostOptions) {
    this.scratchBase = path.resolve(options.scratchBase);
    this.userData = path.resolve(options.userData);
    this.mediaRoot = path.resolve(options.mediaRoot);
    this.home = path.resolve(options.home);
    this.filesystemPolicy = options.filesystemPolicy;
    this.wrapCommand = options.wrap ?? wrapArgv;
    this.runCommand = options.run ?? runShell;
    this.cleanupCommand = options.cleanup ?? cleanupAfterCommand;
    this.shellExecutor = async (request, scope, signal) =>
      await this.execute(request, scope, signal);
  }

  private async execute(
    request: ShellRunRequest,
    scope: ShellExecutionScope,
    signal?: AbortSignal
  ): Promise<ShellRunResult> {
    const grant = await this.resolveGrant(request, scope);
    const commandTempBase = path.join(this.scratchBase, COMMANDS_DIRNAME);
    await ensurePrivateDirectory(commandTempBase);
    const commandTemp = await fs.mkdtemp(path.join(commandTempBase, "cmd-"));
    await fs.chmod(commandTemp, PRIVATE_DIR_MODE);
    let wrappedSuccessfully = false;

    try {
      const policy = this.commandPolicy(grant, commandTemp);
      const command = shellJoin([
        "env",
        `TMPDIR=${commandTemp}`,
        `TMP=${commandTemp}`,
        `TEMP=${commandTemp}`,
        request.cmd,
        ...request.args,
      ]);
      const wrapped = await this.wrapCommand(command, policy, signal);
      // SRT owns failed-wrap cleanup internally. Only a successful wrap adds
      // one live worker that this host must release after the process exits.
      wrappedSuccessfully = true;
      if (wrapped.argv.length === 0) {
        throw new Error("sandbox wrapper returned no command");
      }
      const result = await this.runCommand(
        {
          cmd: wrapped.argv[0],
          args: wrapped.argv.slice(1),
          cwd: grant.cwd,
          timeout_ms: request.timeout_ms,
        },
        { signal }
      );
      // The wrapper argv/profile are host internals. Preserve the model-visible
      // identity of the command the tool actually requested.
      return {
        ...result,
        cmd: request.cmd,
        args: [...request.args],
        cwd: grant.cwd,
      };
    } finally {
      try {
        await fs.rm(commandTemp, { recursive: true, force: true });
      } finally {
        if (wrappedSuccessfully) this.cleanupCommand();
      }
    }
  }

  private async resolveGrant(
    request: ShellRunRequest,
    scope: ShellExecutionScope
  ): Promise<{
    workspaceRoot: string;
    scratchRoot?: string;
    scratchBase: string;
    userData: string;
    mediaRoot: string;
    cwd: string;
  }> {
    const expectedScratchBase = await realpathNearest(this.scratchBase);
    if (scope.scratch_base) {
      const claimed = await realpathNearest(scope.scratch_base);
      if (claimed !== expectedScratchBase) {
        throw new Error("command scope names an unexpected scratch base");
      }
    }

    const workspaceRoot = await realDirectory(
      scope.workspace_root,
      "workspace"
    );
    const userData = await realpathNearest(this.userData);
    const mediaRoot = await realpathNearest(this.mediaRoot);
    if (
      containsPath(userData, workspaceRoot) ||
      containsPath(workspaceRoot, userData)
    ) {
      throw new Error("command workspace overlaps the agent secret root");
    }
    if (
      containsPath(userData, expectedScratchBase) ||
      containsPath(expectedScratchBase, userData)
    ) {
      throw new Error("scratch authority overlaps the agent secret root");
    }
    if (
      containsPath(mediaRoot, workspaceRoot) ||
      containsPath(workspaceRoot, mediaRoot)
    ) {
      throw new Error("command workspace overlaps the media library root");
    }
    if (
      containsPath(mediaRoot, expectedScratchBase) ||
      containsPath(expectedScratchBase, mediaRoot)
    ) {
      throw new Error("scratch authority overlaps the media library root");
    }
    if (
      containsPath(userData, mediaRoot) ||
      containsPath(mediaRoot, userData)
    ) {
      throw new Error("media library root overlaps the agent secret root");
    }
    // A workspace that contains the shared scratch base would make the
    // workspace write grant cover every session. The inverse is equally
    // invalid: scratch is not a workspace.
    if (
      containsPath(expectedScratchBase, workspaceRoot) ||
      containsPath(workspaceRoot, expectedScratchBase)
    ) {
      throw new Error("command workspace overlaps the scratch authority root");
    }

    let scratchRoot: string | undefined;
    if (scope.scratch_root) {
      scratchRoot = await realDirectory(scope.scratch_root, "scratch");
      const sessionDir = path.dirname(scratchRoot);
      const sessionsDir = path.dirname(sessionDir);
      if (
        path.basename(scratchRoot) !== "scratch" ||
        path.dirname(sessionsDir) !== expectedScratchBase ||
        path.basename(sessionsDir) !== "sessions" ||
        !/^[A-Za-z0-9_-]+$/.test(path.basename(sessionDir))
      ) {
        throw new Error("command scope names an invalid session scratch root");
      }
    }

    const cwd = await realDirectory(request.cwd, "cwd");
    if (
      !containsPath(workspaceRoot, cwd) &&
      !(scratchRoot && containsPath(scratchRoot, cwd))
    ) {
      throw new Error("command cwd is outside its session-bound roots");
    }

    return {
      workspaceRoot,
      scratchRoot,
      scratchBase: expectedScratchBase,
      userData,
      mediaRoot,
      cwd,
    };
  }

  private commandPolicy(
    grant: {
      workspaceRoot: string;
      scratchRoot?: string;
      scratchBase: string;
      userData: string;
      mediaRoot: string;
    },
    commandTemp: string
  ): Partial<SandboxRuntimeConfig> {
    const sharedWriteDefaults = [
      ...SHARED_SRT_TMP_DIRS,
      path.join(this.home, ".npm", "_logs"),
      path.join(this.home, ".claude", "debug"),
    ];
    const allowedRead = [
      ...(grant.scratchRoot ? [grant.scratchRoot] : []),
      commandTemp,
    ];
    const allowedWrite = [
      grant.workspaceRoot,
      ...(grant.scratchRoot ? [grant.scratchRoot] : []),
      commandTemp,
    ];
    return {
      // Desktop's process-global SRT manager is initialized with an empty
      // destination set. SRT 0.0.65 authorizes proxy requests against that
      // global set, not this per-call copy; any future outer widening must use
      // a separate manager/proxy for finite workers rather than assuming this
      // field narrows it again.
      network: {
        allowedDomains: [],
        deniedDomains: [],
        allowLocalBinding: false,
      },
      filesystem: {
        // Read is deny-then-allow in SRT. Deny the whole shared scratch base,
        // then carve back only this session's root and this command's private
        // temp. `userData` is denied at the kernel here even though the
        // long-lived host itself must read it.
        denyRead: uniquePaths([
          ...this.filesystemPolicy.deny_read,
          grant.userData,
          grant.mediaRoot,
          grant.scratchBase,
          ...sharedWriteDefaults,
        ]),
        // Workspace reads are already allowed by SRT's default-read model.
        // Do not carve the workspace back through an outer deny (for example,
        // when a user opens ~/.ssh as a workspace).
        allowRead: uniquePaths(allowedRead),
        // Write is allow-then-deny. The scratch base deliberately lives
        // outside SRT's unconditional shared temp defaults, so these exact
        // grants do not cover sibling sessions.
        allowWrite: uniquePaths(allowedWrite),
        denyWrite: uniquePaths([
          ...this.filesystemPolicy.deny_write,
          grant.userData,
          grant.mediaRoot,
          ...sharedWriteDefaults,
        ]),
      },
    };
  }
}

async function realDirectory(value: string, label: string): Promise<string> {
  if (!path.isAbsolute(value)) {
    throw new Error(`${label} must be an absolute path`);
  }
  const real = await fs.realpath(value);
  const stat = await fs.stat(real);
  if (!stat.isDirectory()) throw new Error(`${label} is not a directory`);
  return real;
}

async function realpathNearest(value: string): Promise<string> {
  let current = path.resolve(value);
  const tail: string[] = [];
  for (;;) {
    try {
      const real = await fs.realpath(current);
      return tail.length ? path.join(real, ...tail.reverse()) : real;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return path.resolve(value);
      tail.push(path.basename(current));
      current = parent;
    }
  }
}

function uniquePaths(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => path.resolve(value)))];
}

async function ensurePrivateDirectory(target: string): Promise<void> {
  try {
    await fs.mkdir(target, { recursive: false, mode: PRIVATE_DIR_MODE });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  let stat = await fs.lstat(target);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`command temp authority is not a directory: ${target}`);
  }
  assertCurrentOwner(target, stat);
  if (process.platform !== "win32") {
    await fs.chmod(target, PRIVATE_DIR_MODE);
    stat = await fs.lstat(target);
    assertCurrentOwner(target, stat);
    if ((stat.mode & 0o777) !== PRIVATE_DIR_MODE) {
      throw new Error(`command temp authority is not owner-only: ${target}`);
    }
  }
}

function assertCurrentOwner(target: string, stat: import("node:fs").Stats) {
  if (
    process.platform !== "win32" &&
    typeof process.getuid === "function" &&
    stat.uid !== process.getuid()
  ) {
    throw new Error(
      `command temp authority is not owned by this user: ${target}`
    );
  }
}

function shellJoin(values: readonly string[]): string {
  return values.map(shellQuote).join(" ");
}

function shellQuote(value: string): string {
  if (value.length === 0) return "''";
  return `'${value.replaceAll("'", `'\\''`)}'`;
}
