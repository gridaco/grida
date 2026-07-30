/**
 * GRIDA-SEC-004 — agent command backend.
 *
 * Bridges the agent's `run_command` tool to a host-owned finite-command
 * capability. This file validates the exact session roots, flushes pending fs
 * writes, then delegates execution. It never raw-spawns on its own.
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
import {
  validateShellRequest,
  type ShellExecutionScope,
  type ShellExecutor,
  type ProtectedReadRoots,
  type ShellRunError,
} from "@grida/daemon/server";

export type AgentCommandBackendOptions = Readonly<{
  /** Exact real workspace root granted to this session. */
  workspace_root: string;
  /** Exact real scratch root granted to this session, when present. */
  scratch_root?: string;
  /** Shared scratch base. The host uses it to deny sibling session roots. */
  scratch_base?: string;
  /** Host secret roots denied to finite command workers. */
  protected_read_roots?: ProtectedReadRoots;
  /** Host-injected execution boundary. */
  executor: ShellExecutor;
  /** Flush pending AgentFs writes before execution. */
  before_run?: () => Promise<void>;
  /** Shared workspace-operation FIFO. */
  run_exclusive?: <T>(action: () => Promise<T>) => Promise<T>;
  /**
   * Bind an executing command to its owning run's terminal-settlement barrier.
   * Desktop uses this so abort cannot admit a replacement until main confirms
   * the confined worker and its per-command authority are gone.
   */
  track_execution?: (task: Promise<unknown>) => void;
}>;

export function createAgentCommandBackend(
  options: AgentCommandBackendOptions
): RunCommandBackend {
  const protectedReadRoots = Object.freeze([
    ...(options.protected_read_roots ?? []),
  ]);
  const allowedCwdRoots = Object.freeze([
    options.workspace_root,
    ...(options.scratch_root ? [options.scratch_root] : []),
  ]);
  const scope: ShellExecutionScope = Object.freeze({
    workspace_root: options.workspace_root,
    scratch_root: options.scratch_root,
    scratch_base: options.scratch_base,
    protected_read_roots: protectedReadRoots,
  });
  const execute: RunCommandBackend = async (
    { command, args, workdir, timeout_ms: timeoutMs },
    signal
  ) => {
    // Make the agent's just-written files visible on disk before the command
    // reads them (the fs tools flush on a debounce; a command bypasses the fs
    // and reads the backing store directly).
    if (options.before_run) await options.before_run();
    const validation = await validateShellRequest(
      { cmd: command, args, cwd: workdir, timeout_ms: timeoutMs },
      allowedCwdRoots,
      protectedReadRoots
    );
    if (!validation.ok) {
      return {
        ok: false,
        code: validation.error.code,
        message: describeError(validation.error),
      };
    }
    const r = await options.executor(validation.request, scope, signal);
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
  return (input, signal) => {
    const task = options.run_exclusive
      ? options.run_exclusive(() => execute(input, signal))
      : execute(input, signal);
    options.track_execution?.(task);
    return task;
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
