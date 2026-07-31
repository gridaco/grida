/**
 * GRIDA-SEC-004 — shell runner.
 *
 * Spawns a child process via `child_process.spawn` (no shell
 * interpolation — args are passed verbatim, so quoting attacks via
 * args are not possible). Returns buffered stdout/stderr + exit
 * info after the child exits.
 *
 * Why buffered, not streamed: the SSE path adds a layer of
 * complexity (callbacks across a host bridge, backpressure
 * semantics, abort plumbing) that the demo doesn't need. For long-
 * running commands a streaming variant will land later.
 *
 * Command *identity* is NOT gated here. The pre-srt hardcoded allowlist is
 * gone — the OS sandbox (srt) is the structural boundary, and the supervised
 * mode's read-only-vs-mutating gate lives upstream in the command backend
 * (`runtime/command-backend.ts`, via `permissions.ts`). What remains here are
 * the request-validation gates that hold in every mode:
 *
 *   1. cwd must be `realpath`-resolvable AND contained by a
 *      caller-supplied exact allowed root. The agent tenant supplies only the
 *      current session's workspace and scratch roots; a global workspace
 *      registry is deliberately not accepted here.
 *   2. No arg may resolve to a path inside a protected-secret root
 *      (the agent host's own `userData`, where BYOK `auth.json` and
 *      the sessions db live). The srt outer policy can't deny that
 *      root — the host process itself reads it for provider auth — so
 *      this in-process arg check keeps `cat ${userData}/auth.json`
 *      from leaking the key through a direct arg. A confined
 *      {@link ShellExecutor} also receives the protected roots and must deny
 *      them at the finite child-process boundary. See `sandbox/policy.ts`.
 *
 * GRIDA-SEC-004: gate 2 is defense-in-depth, NOT general arg containment. It
 * denies exactly the secret root, nothing more — so an arg's "is this a path?"
 * guess only ever costs the secret dir, never a false rejection of normal
 * in-workspace work. Computed paths are contained by the host executor.
 *
 * Timeout: 30s hard cap. Long-running processes are killed (SIGKILL
 * after a SIGTERM grace). The route returns `exitCode: null,
 * signal: 'SIGKILL', timedOut: true` so the client can show a
 * meaningful error.
 *
 * Stdout/stderr are decoded as UTF-8 and capped at 1 MiB combined
 * to keep a runaway command from OOMing the agent host. Anything past
 * the cap is dropped with a `truncated: true` flag.
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { containsPath } from "../path-contains";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_BUFFER_BYTES = 1 * 1024 * 1024; // 1 MiB combined
const SIGTERM_GRACE_MS = 250;
const PROCESS_GROUP_POLL_MS = 10;

export type ShellRunRequest = {
  cmd: string;
  args: string[];
  cwd: string;
  /** Optional override; capped to 60s server-side. */
  timeout_ms?: number;
};

export type ShellRunResult = {
  cmd: string;
  args: string[];
  cwd: string;
  exit_code: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  duration_ms: number;
  timed_out: boolean;
  truncated: boolean;
};

export type ShellRunOptions = Readonly<{
  /** Host-lifecycle cancellation (for example, a retired sidecar generation). */
  signal?: AbortSignal;
}>;

/**
 * Immutable authority the host must enforce around one finite command.
 *
 * The tenant derives this from server-owned session state. A confined host
 * executor must independently bind and validate the roots before spawning;
 * the in-process cwd/arg validation below is defense-in-depth, not the
 * filesystem sandbox.
 */
export type ShellExecutionScope = Readonly<{
  workspace_root: string;
  scratch_root?: string;
  scratch_base?: string;
  protected_read_roots: ProtectedReadRoots;
}>;

/**
 * Host-owned finite-command capability. Desktop implementations confine each
 * invocation at the OS boundary; deliberately unsandboxed hosts may inject
 * {@link runUnsandboxedShell} explicitly.
 */
export type ShellExecutor = (
  request: ShellRunRequest,
  scope: ShellExecutionScope,
  signal?: AbortSignal
) => Promise<ShellRunResult>;

export type ShellRunError =
  | { code: "cwd-not-in-workspace"; cwd: string }
  | { code: "cwd-not-a-directory"; cwd: string }
  | { code: "cwd-resolve-failed"; cwd: string; reason: string }
  | { code: "arg-in-protected-root"; arg: string };

/**
 * GRIDA-SEC-004 — secret roots the shell child must not read through an
 * arg. Resolved against the agent host's `userData` and threaded down from
 * the runtime ({@link createAgentCommandBackend}). Empty when no host
 * supplied one (e.g. the standalone/no-bindings path).
 */
export type ProtectedReadRoots = readonly string[];

/**
 * Exact absolute roots a cwd may sit inside. For a workspace-bound agent this
 * is the current session's workspace plus, when present, its own scratch root.
 * Realpath'd here for symlink stability, same as the protected roots.
 */
export type AllowedCwdRoots = readonly string[];

/**
 * Validates a shell-run request against exact allowed cwd roots and the
 * protected-secret roots. Command identity is gated upstream by mode — see the
 * module header. Returns either `{ok, request}` with the cwd-`realpath`'d
 * request, or `{ok:false, error}` with a structured error.
 *
 * `protectedReadRoots` are absolute secret roots (the agent host's
 * `userData`) the shell child must not read through any arg — see the
 * module header's gate (2). Omit for the no-bindings path.
 */
export async function validateShellRequest(
  req: ShellRunRequest,
  allowedCwdRoots: AllowedCwdRoots,
  protectedReadRoots: ProtectedReadRoots = []
): Promise<
  { ok: true; request: ShellRunRequest } | { ok: false; error: ShellRunError }
> {
  let realCwd: string;
  try {
    realCwd = await fs.realpath(req.cwd);
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "cwd-resolve-failed",
        cwd: req.cwd,
        reason: err instanceof Error ? err.message : "unknown",
      },
    };
  }
  let stat;
  try {
    stat = await fs.stat(realCwd);
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "cwd-resolve-failed",
        cwd: req.cwd,
        reason: err instanceof Error ? err.message : "unknown",
      },
    };
  }
  if (!stat.isDirectory()) {
    return { ok: false, error: { code: "cwd-not-a-directory", cwd: req.cwd } };
  }
  // Bind cwd to THIS command grant, never the process-global registry. A
  // daemon can have many opened workspaces and many session scratch roots; the
  // current command receives exactly one workspace and at most one scratch.
  const inAllowedRoot =
    allowedCwdRoots.length > 0 &&
    (await realpathRoots(allowedCwdRoots)).some((root) =>
      containsPath(root, realCwd)
    );
  if (!inAllowedRoot) {
    return {
      ok: false,
      error: { code: "cwd-not-in-workspace", cwd: realCwd },
    };
  }
  // Gate 3 — secret-root containment. Resolve every arg that looks like a
  // path against the (realpath'd) cwd and reject the whole command if it
  // lands inside a protected root. Realpathing the nearest existing
  // ancestor mirrors the cwd discipline so a symlink can't bypass it.
  if (protectedReadRoots.length > 0) {
    const roots = await realpathRoots(protectedReadRoots);
    for (const arg of req.args) {
      const resolved = await resolveArgPath(arg, realCwd);
      if (resolved !== null && roots.some((r) => containsPath(r, resolved))) {
        return { ok: false, error: { code: "arg-in-protected-root", arg } };
      }
    }
  }
  return {
    ok: true,
    request: {
      cmd: req.cmd,
      args: req.args,
      cwd: realCwd,
      timeout_ms: req.timeout_ms,
    },
  };
}

/** Realpath each root so the comparison is symlink-stable (used for both the
 *  protected-secret roots and the additional-allowed roots). A root that
 *  doesn't exist yet is kept as-is (still a valid prefix). */
async function realpathRoots(roots: readonly string[]): Promise<string[]> {
  return await Promise.all(
    roots.map(async (root) => {
      try {
        return await fs.realpath(root);
      } catch {
        return path.resolve(root);
      }
    })
  );
}

/**
 * Resolve an arg to an absolute path for the secret-root check, or `null`
 * when it clearly isn't a path (a flag like `-n`, or plain text with no
 * separators). Be conservative: anything with a separator, or an absolute
 * path, is treated as a path — the check only ever denies the secret root,
 * so a false "this is a path" guess is harmless. The nearest EXISTING
 * ancestor is realpath'd (mirroring the cwd discipline) so a symlinked
 * component can't smuggle the resolved target out of a protected root.
 */
async function resolveArgPath(
  arg: string,
  cwd: string
): Promise<string | null> {
  if (arg.length === 0) return null;
  // Flags (`-n`, `--color`) are not paths.
  if (arg.startsWith("-")) return null;
  // Plain text with no path separators is not treated as a path.
  if (!arg.includes("/") && !arg.includes("\\") && !path.isAbsolute(arg)) {
    return null;
  }
  const abs = path.resolve(cwd, arg);
  return await realpathNearest(abs);
}

/** Realpath `abs` if it exists; otherwise realpath the nearest existing
 *  ancestor and re-join the missing tail, so a not-yet-created target
 *  under a symlinked secret dir still resolves into the protected root. */
async function realpathNearest(abs: string): Promise<string> {
  let current = abs;
  const tail: string[] = [];
  // Walk up until an existing component is found (the filesystem root
  // always exists, so this terminates).
  while (true) {
    try {
      const real = await fs.realpath(current);
      return tail.length ? path.join(real, ...tail.reverse()) : real;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return path.resolve(abs);
      tail.push(path.basename(current));
      current = parent;
    }
  }
}

/**
 * Low-level raw process runner. It does NOT validate or confine the request:
 * callers either run `validateShellRequest` first under an explicit
 * unsandboxed posture, or pass an already sandbox-wrapped command from a
 * trusted host executor.
 *
 * Always resolves — never rejects on child failure. Non-zero exit,
 * signal kill, and timeout are all expressed in the returned
 * `ShellRunResult`.
 */
export async function runShell(
  req: ShellRunRequest,
  options: ShellRunOptions = {}
): Promise<ShellRunResult> {
  const timeoutMs = Math.min(req.timeout_ms ?? DEFAULT_TIMEOUT_MS, 60_000);
  const startedAt = Date.now();
  const ownsProcessGroup = process.platform !== "win32";

  return await new Promise<ShellRunResult>((resolve) => {
    // `shell: false` is critical — args are passed straight to the
    // process, no shell interpolation. Quoting/metacharacter attacks
    // via args aren't possible. (The `bash -c "..."` escape hatch is
    // a separate concern; see `policy.ts`.)
    const child = spawn(req.cmd, req.args, {
      cwd: req.cwd,
      shell: false,
      // A finite command owns a fresh POSIX process group. Timeout, host abort,
      // and even a normally exiting wrapper terminate the whole group before
      // the caller releases command-scoped filesystem authority. Windows
      // Desktop withholds run_command; the raw CLI fallback retains direct
      // child termination there.
      detached: ownsProcessGroup,
      // Fresh-ish env — keep PATH so the shell can find binaries, but
      // strip anything the agent host might have set that shouldn't leak
      // into a user-issued command. A fuller env scrub waits for srt.
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        LANG: process.env.LANG ?? "C.UTF-8",
        // No agent server password, no Supabase keys, no auth.json contents —
        // process.env is generally safe here because DaemonServer receives
        // credentials out-of-band, but explicit is better.
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let bufferedBytes = 0;
    let truncated = false;
    let timedOut = false;
    let killTimer: NodeJS.Timeout | null = null;
    let terminationStarted = false;
    let settled = false;

    const terminate = (fromTimeout: boolean) => {
      if (terminationStarted) return;
      terminationStarted = true;
      if (fromTimeout) timedOut = true;
      // SIGTERM first, then SIGKILL after a short grace if the child
      // hasn't exited. Matches Unix convention; gives well-behaved
      // children a chance to clean up.
      signalProcessTree(child.pid, child, ownsProcessGroup, "SIGTERM");
      killTimer = setTimeout(() => {
        signalProcessTree(child.pid, child, ownsProcessGroup, "SIGKILL");
      }, SIGTERM_GRACE_MS);
    };
    const timeout = setTimeout(() => terminate(true), timeoutMs);
    const abort = () => terminate(false);

    const cleanupListeners = () => {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);
    };

    const finish = async (
      exitCode: number | null,
      exitSignal: NodeJS.Signals | null,
      spawnError?: Error
    ) => {
      if (settled) return;
      settled = true;
      // Report command lifetime through the child exit/error event. Process-
      // group revocation below is a host cleanup barrier, not command work,
      // and can consume one or two grace windows independently.
      const durationMs = Date.now() - startedAt;
      cleanupListeners();

      // A shell wrapper can exit successfully after launching a background
      // descendant. Revoke that group's lifetime before the host removes its
      // private temp or releases SRT's per-command state.
      if (ownsProcessGroup && child.pid) {
        if (!terminationStarted) {
          terminationStarted = true;
          signalProcessTree(child.pid, child, true, "SIGTERM");
        }
        const afterTerm = await waitForProcessGroupExit(
          child.pid,
          SIGTERM_GRACE_MS
        );
        if (afterTerm !== "exited") {
          // An unknown status (for example EPERM from kill(-pgid, 0)) cannot
          // prove revocation. Escalate immediately rather than spending a
          // grace window repeatedly making an unverifiable probe.
          signalProcessTree(child.pid, child, true, "SIGKILL");
          await waitForProcessGroupExit(child.pid, SIGTERM_GRACE_MS);
        }
      }
      if (killTimer) clearTimeout(killTimer);

      resolve({
        cmd: req.cmd,
        args: req.args,
        cwd: req.cwd,
        exit_code: spawnError ? -1 : exitCode,
        signal: exitSignal ?? null,
        stdout,
        stderr: spawnError
          ? stderr + `\n[spawn error] ${spawnError.message}`
          : stderr,
        duration_ms: durationMs,
        timed_out: timedOut,
        truncated,
      });
    };

    const append = (which: "stdout" | "stderr", chunk: Buffer) => {
      if (truncated) return;
      const remaining = MAX_BUFFER_BYTES - bufferedBytes;
      if (remaining <= 0) {
        truncated = true;
        return;
      }
      const used = Math.min(chunk.length, remaining);
      const text = chunk.slice(0, used).toString("utf8");
      if (which === "stdout") stdout += text;
      else stderr += text;
      bufferedBytes += used;
      if (used < chunk.length) truncated = true;
    };

    child.stdout?.on("data", (chunk: Buffer) => append("stdout", chunk));
    child.stderr?.on("data", (chunk: Buffer) => append("stderr", chunk));

    child.on("error", (err) => {
      // Spawn-time errors (ENOENT etc.) surface here. Treat as
      // exit code -1 with the error message in stderr so the client
      // gets a meaningful response.
      void finish(null, null, err);
    });

    child.on("exit", (code, signal) => {
      void finish(code, signal);
    });

    if (options.signal?.aborted) abort();
    else options.signal?.addEventListener("abort", abort, { once: true });
  });
}

function signalProcessTree(
  pid: number | undefined,
  child: ReturnType<typeof spawn>,
  ownsProcessGroup: boolean,
  signal: NodeJS.Signals
): void {
  if (ownsProcessGroup && pid) {
    try {
      process.kill(-pid, signal);
      return;
    } catch (error) {
      if (isNoSuchProcess(error)) return;
      // Fall through to the direct child as defense in depth.
    }
  }
  try {
    child.kill(signal);
  } catch {
    // already dead
  }
}

async function waitForProcessGroupExit(
  pid: number,
  timeoutMs: number
): Promise<ProcessGroupStatus> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const status = processGroupStatus(pid);
    if (status !== "alive") return status;
    if (Date.now() >= deadline) return "alive";
    await new Promise((resolve) => setTimeout(resolve, PROCESS_GROUP_POLL_MS));
  }
}

type ProcessGroupStatus = "alive" | "exited" | "unknown";

function processGroupStatus(pid: number): ProcessGroupStatus {
  try {
    process.kill(-pid, 0);
    return "alive";
  } catch (error) {
    return isNoSuchProcess(error) ? "exited" : "unknown";
  }
}

function isNoSuchProcess(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ESRCH"
  );
}

/**
 * Explicitly unsafe adapter for hosts that intentionally expose the raw
 * process runner without an OS confinement layer.
 *
 * Keeping this separate from {@link runShell} prevents the low-level runner
 * from being accidentally assigned as a {@link ShellExecutor}: the latter
 * receives a security scope that a real host executor must enforce.
 */
export const runUnsandboxedShell: ShellExecutor = (request, _scope, signal) =>
  runShell(request, { signal });
