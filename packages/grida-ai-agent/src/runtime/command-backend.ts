/**
 * GRIDA-SEC-004 — agent command backend.
 *
 * Bridges the agent's `run_command` tool to the agent-host shell
 * policy. This file is the whole command execution adapter: validate
 * command + workdir first, then run through the host shell runner.
 */

import type { RunCommandBackend } from "../agent";
import type { WorkspaceRegistry } from "../workspaces";
import {
  validateShellRequest,
  runShell,
  type ShellRunError,
} from "../shell/runner";

export function createAgentCommandBackend(
  registry: WorkspaceRegistry
): RunCommandBackend {
  return async ({ command, args, workdir, timeout_ms: timeoutMs }) => {
    const validation = await validateShellRequest(
      { cmd: command, args, cwd: workdir, timeout_ms: timeoutMs },
      registry
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
    case "cmd-not-allowed":
      return `Command not in allowlist: ${err.cmd}`;
    case "cwd-not-in-workspace":
      return `cwd is not inside an opened workspace: ${err.cwd}`;
    case "cwd-not-a-directory":
      return `cwd is not a directory: ${err.cwd}`;
    case "cwd-resolve-failed":
      return `Couldn't resolve cwd ${err.cwd}: ${err.reason}`;
  }
}
