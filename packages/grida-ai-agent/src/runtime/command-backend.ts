/**
 * GRIDA-SEC-004 — agent command backend.
 *
 * Bridges the agent's `run_command` tool to the agent-host shell
 * policy. This file is the whole command execution adapter: validate
 * workdir + secret-arg, then run through the host shell runner.
 *
 * The supervised mode gate (RFC `permission modes`) is NOT here — it lives in
 * the tool's `needsApproval` (`createRunCommandTool`), wired from the session
 * mode at `workspace-agent-bindings.ts`. By the time this backend's `execute`
 * runs, the SDK has already cleared the call: `auto` (never asked) or the user
 * pressed Allow. Re-gating on mode here would refuse an *approved* command,
 * since `execute` can't see the approval. This backend keeps only the
 * structural GRIDA-SEC-004 gates (cwd-in-workspace, secret-arg) — those hold
 * in every mode.
 */

import type { RunCommandBackend } from "../agent";
import type { WorkspaceRegistry } from "@grida/daemon/server";
import {
  validateShellRequest,
  runShell,
  type ProtectedReadRoots,
  type AdditionalAllowedRoots,
  type ShellRunError,
} from "@grida/daemon/server";

/**
 * @param protectedReadRoots Secret roots (the agent host's `userData`) the
 *   shell child must not read through an arg (GRIDA-SEC-004). Threaded down
 *   from the runtime; empty for the no-bindings/standalone path.
 * @param additionalAllowedRoots Roots — beyond the registered workspaces — a
 *   cwd may sit inside (the session scratch dir, WG `scratch.md`). Empty when no
 *   scratch is wired.
 * @param beforeRun Optional hook awaited just before a command spawns — used to
 *   flush the agent fs's pending (debounced) writes to disk, so a command that
 *   reads the workspace sees files the agent just wrote via the fs tools.
 */
export function createAgentCommandBackend(
  registry: WorkspaceRegistry,
  protectedReadRoots: ProtectedReadRoots = [],
  additionalAllowedRoots: AdditionalAllowedRoots = [],
  beforeRun?: () => Promise<void>
): RunCommandBackend {
  return async ({ command, args, workdir, timeout_ms: timeoutMs }) => {
    // Make the agent's just-written files visible on disk before the command
    // reads them (the fs tools flush on a debounce; a command bypasses the fs
    // and reads the backing store directly).
    if (beforeRun) await beforeRun();
    const validation = await validateShellRequest(
      { cmd: command, args, cwd: workdir, timeout_ms: timeoutMs },
      registry,
      protectedReadRoots,
      additionalAllowedRoots
    );
    if (!validation.ok) {
      return {
        ok: false,
        code: validation.error.code,
        message: describeError(validation.error),
      };
    }
    const r = await runShell(validation.request);
    return {
      stdout: r.truncated ? r.stdout + "\n[stdout truncated]" : r.stdout,
      stderr: r.truncated ? r.stderr + "\n[stderr truncated]" : r.stderr,
      exit_code: r.exit_code,
      signal: r.signal,
      timed_out: r.timed_out,
      truncated: r.truncated,
      duration_ms: r.duration_ms,
    };
  };
}

function describeError(err: ShellRunError): string {
  switch (err.code) {
    case "cwd-not-in-workspace":
      return `cwd is not inside an opened workspace: ${err.cwd}`;
    case "cwd-not-a-directory":
      return `cwd is not a directory: ${err.cwd}`;
    case "cwd-resolve-failed":
      return `Couldn't resolve cwd ${err.cwd}: ${err.reason}`;
    case "arg-in-protected-root":
      // GRIDA-SEC-004: do NOT echo the resolved path — reflecting it back
      // into the (renderer-visible) tool result would confirm the secret
      // dir's location to a probing caller.
      return `Argument rejected: resolves inside a protected directory.`;
  }
}
