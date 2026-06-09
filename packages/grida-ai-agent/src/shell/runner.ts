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
 * the two STRUCTURAL gates that hold in every mode:
 *
 *   1. cwd must be `realpath`-resolvable AND contained by a
 *      currently-registered workspace. Without an opened workspace
 *      the call fails.
 *   2. No arg may resolve to a path inside a protected-secret root
 *      (the agent host's own `userData`, where BYOK `auth.json` and
 *      the sessions db live). The srt outer policy can't deny that
 *      root — the host process itself reads it for provider auth — so
 *      this in-process arg check keeps `cat ${userData}/auth.json`
 *      from leaking the key to the shell child. See `sandbox/policy.ts`.
 *      (A kernel-level per-call deny is the planned hardening; until then
 *      this is the load-bearing guard for the host's own key — though an
 *      interpreter in `auto` can read by a computed path, which is why the
 *      per-call sub-policy is the real fix.)
 *
 * GRIDA-SEC-004: gate 2 is NOT general arg containment (deferred to the
 * srt per-cmd sub-policy). It denies exactly the secret root, nothing
 * more — so an arg's "is this a path?" guess only ever costs the secret
 * dir, never a false rejection of normal in-workspace work.
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
import type { WorkspaceRegistry } from "../workspaces";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_BUFFER_BYTES = 1 * 1024 * 1024; // 1 MiB combined
const SIGTERM_GRACE_MS = 250;

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
 * Validates a shell-run request against the workspace registry and the
 * protected-secret roots (the two structural gates; command identity is gated
 * upstream by mode — see the module header). Returns either `{ok, request}`
 * with the cwd-`realpath`'d request, or `{ok:false, error}` with a structured
 * error the route handler can return as 400/403.
 *
 * `protectedReadRoots` are absolute secret roots (the agent host's
 * `userData`) the shell child must not read through any arg — see the
 * module header's gate (2). Omit for the no-bindings path.
 */
export async function validateShellRequest(
  req: ShellRunRequest,
  registry: WorkspaceRegistry,
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
  // Force the registry to be loaded — the route handler calls
  // `registry.list()` upstream so this is usually warm, but the sync
  // `containsPath` requires it.
  await registry.list();
  if (!registry.containsPath(realCwd)) {
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
    const roots = await resolveProtectedRoots(protectedReadRoots);
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

/** `path.sep`-terminated prefix containment — same discipline as
 *  {@link WorkspaceRegistry.containsPath}, so a sibling like
 *  `${userData}-backup` never counts as inside `${userData}`. */
function containsPath(root: string, candidate: string): boolean {
  const prefix = root.endsWith(path.sep) ? root : root + path.sep;
  return candidate === root || candidate.startsWith(prefix);
}

/** Realpath each protected root so the comparison is symlink-stable.
 *  A root that doesn't exist yet is kept as-is (still a valid prefix). */
async function resolveProtectedRoots(
  roots: ProtectedReadRoots
): Promise<string[]> {
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
 * Runs the validated request. The caller is expected to have run
 * `validateShellRequest` first; this function does NOT re-validate
 * (passing an unvalidated request is a programming error).
 *
 * Always resolves — never rejects on child failure. Non-zero exit,
 * signal kill, and timeout are all expressed in the returned
 * `ShellRunResult`.
 */
export async function runShell(req: ShellRunRequest): Promise<ShellRunResult> {
  const timeoutMs = Math.min(req.timeout_ms ?? DEFAULT_TIMEOUT_MS, 60_000);
  const startedAt = Date.now();

  return await new Promise<ShellRunResult>((resolve) => {
    // `shell: false` is critical — args are passed straight to the
    // process, no shell interpolation. Quoting/metacharacter attacks
    // via args aren't possible. (The `bash -c "..."` escape hatch is
    // a separate concern; see `policy.ts`.)
    const child = spawn(req.cmd, req.args, {
      cwd: req.cwd,
      shell: false,
      // Fresh-ish env — keep PATH so the shell can find binaries, but
      // strip anything the agent host might have set that shouldn't leak
      // into a user-issued command. A fuller env scrub waits for srt.
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        LANG: process.env.LANG ?? "C.UTF-8",
        // No agent server password, no Supabase keys, no auth.json contents —
        // process.env is generally safe here because AgentHost receives
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

    const timeout = setTimeout(() => {
      timedOut = true;
      // SIGTERM first, then SIGKILL after a short grace if the child
      // hasn't exited. Matches Unix convention; gives well-behaved
      // children a chance to clean up.
      try {
        child.kill("SIGTERM");
      } catch {
        // already dead
      }
      killTimer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // already dead
        }
      }, SIGTERM_GRACE_MS);
    }, timeoutMs);

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
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      resolve({
        cmd: req.cmd,
        args: req.args,
        cwd: req.cwd,
        exit_code: -1,
        signal: null,
        stdout,
        stderr: stderr + `\n[spawn error] ${err.message}`,
        duration_ms: Date.now() - startedAt,
        timed_out: timedOut,
        truncated,
      });
    });

    child.on("exit", (code, signal) => {
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      resolve({
        cmd: req.cmd,
        args: req.args,
        cwd: req.cwd,
        exit_code: code,
        signal: signal ?? null,
        stdout,
        stderr,
        duration_ms: Date.now() - startedAt,
        timed_out: timedOut,
        truncated,
      });
    });
  });
}
