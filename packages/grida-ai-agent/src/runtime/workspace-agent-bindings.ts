/**
 * GRIDA-SEC-004 — workspace-bound agent bindings.
 *
 * Converts an opened workspace into the agent's storage and command
 * capabilities. Runtime orchestration decides when to call this; this
 * module only adapts contracts.
 */

import { AgentFs } from "../fs";
import { AgentTodos } from "../todos";
import type { SkillId } from "../agent";
import { createAgentCommandBackend } from "./command-backend";
import { workspaceFs } from "../workspaces/fs";
import type { Workspace, WorkspaceRegistry } from "../workspaces";

export type WorkspaceAgentBindingRequest = {
  workspace_root?: string;
  skills?: readonly SkillId[];
};

export async function createWorkspaceAgentBindings(
  req: WorkspaceAgentBindingRequest,
  deps: {
    workspace_registry: WorkspaceRegistry;
    /**
     * Absolute secret root(s) (the agent host's `userData`) the shell child
     * must not read through a command arg (GRIDA-SEC-004). Threaded from the
     * runtime; absent on the no-bindings path. See `shell/runner.ts`.
     */
    secrets_root?: string;
    /**
     * GRIDA-SEC-004 — fail-closed shell gate. When falsy (the default), the
     * `command` capability is NOT returned, so `run_command` never enters the
     * tool registry and the model cannot run a shell. The host sets this true
     * only when an OS sandbox confines the process tree (srt) or it has
     * explicitly opted into an unsandboxed shell. "No containment ⇒ no shell."
     */
    shell_execution_allowed?: boolean;
  }
): Promise<{
  fs: AgentFs;
  todos: AgentTodos;
  command?: {
    backend: ReturnType<typeof createAgentCommandBackend>;
    default_workdir: string;
  };
} | null> {
  if (!req.workspace_root) return null;
  const workspace = await deps.workspace_registry.findByRoot(
    req.workspace_root
  );
  if (!workspace) {
    throw new Error(`workspace not found for root: ${req.workspace_root}`);
  }
  const fs = new AgentFs(new WorkspaceAgentFsBackend(workspace));
  await fs.hydrate();
  const todos = new AgentTodos();
  // GRIDA-SEC-004 fail-closed: only wire shell execution when the host
  // affirmed containment (or an explicit unsandboxed opt-in). Otherwise the
  // workspace still gets fs + todos, but no `run_command`.
  const command = deps.shell_execution_allowed
    ? {
        backend: createAgentCommandBackend(
          deps.workspace_registry,
          deps.secrets_root ? [deps.secrets_root] : []
        ),
        default_workdir: req.workspace_root,
      }
    : undefined;
  return { fs, todos, command };
}

export class WorkspaceAgentFsBackend implements AgentFs.Backend {
  constructor(private readonly workspace: Workspace) {}

  async list(): Promise<string[]> {
    const out: string[] = [];
    await this.walk("", out);
    return out;
  }

  async read(path: string): Promise<string | null> {
    try {
      const result = await workspaceFs.readFile(
        this.workspace,
        logicalPathToRel(path)
      );
      return result.content;
    } catch (err) {
      // The AgentFs.Backend contract is "null when there's no readable text
      // here". That covers a raw ENOENT *and* the structured workspaceFs
      // codes for content we deliberately don't serve as text (a directory,
      // an oversized file, or a binary/non-utf8 file). Policy violations
      // (path escapes, etc.) still throw.
      if (isAbsentForRead(err)) return null;
      throw err;
    }
  }

  async write(path: string, content: string): Promise<void> {
    await workspaceFs.writeFile(
      this.workspace,
      logicalPathToRel(path),
      content
    );
  }

  async delete(path: string): Promise<void> {
    try {
      await workspaceFs.deleteFile(this.workspace, logicalPathToRel(path));
    } catch (err) {
      // Deleting something that isn't a deletable file (missing, or a
      // directory) is a no-op for the backend contract; policy violations
      // still throw.
      if (isNotFound(err) || isWorkspaceFsCode(err, "not-a-file")) return;
      throw err;
    }
  }

  private async walk(relPath: string, out: string[]): Promise<void> {
    const entries = await workspaceFs.readDir(this.workspace, relPath);
    await Promise.all(
      entries.map(async (entry) => {
        if (entry.kind === "directory") {
          await this.walk(entry.rel_path, out);
          return;
        }
        if (entry.kind === "file" || entry.kind === "symlink") {
          out.push("/" + entry.rel_path.replace(/\\/g, "/"));
        }
      })
    );
  }
}

function logicalPathToRel(path: string): string {
  if (!path.startsWith("/")) {
    throw new Error(`agent-fs path must start with "/": ${path}`);
  }
  return path.slice(1);
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}

function isWorkspaceFsCode(err: unknown, code: workspaceFs.ErrorCode): boolean {
  return err instanceof workspaceFs.Exception && err.detail.code === code;
}

/** Raw ENOENT or a workspaceFs code that means "no readable text here". */
function isAbsentForRead(err: unknown): boolean {
  return (
    isNotFound(err) ||
    isWorkspaceFsCode(err, "not-a-file") ||
    isWorkspaceFsCode(err, "file-too-large") ||
    isWorkspaceFsCode(err, "file-not-utf8")
  );
}
