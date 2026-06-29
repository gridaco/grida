/**
 * GRIDA-SEC-004 — workspace-bound agent bindings.
 *
 * Converts an opened workspace into the agent's storage and command
 * capabilities. Runtime orchestration decides when to call this; this
 * module only adapts contracts.
 */

import { AgentFs } from "../fs";
import { isProtectedWrite } from "../fs/scope";
import { isReadOnlyCommand } from "../permissions";
import { AgentTodos } from "../todos";
import { AgentVision } from "../vision";
import type { SkillId } from "../agent";
import { AGENT_DEFAULT_MODE, type AgentMode } from "../protocol/mode";
import { createAgentCommandBackend } from "./command-backend";
import { workspaceFs } from "../workspaces/fs";
import {
  isIgnoredScanDir,
  isIgnoredScanFile,
  SCAN_MAX_DEPTH,
  SCAN_MAX_FILES,
} from "../workspaces/scan";
import type { Workspace, WorkspaceRegistry } from "../workspaces";

export type WorkspaceAgentBindingRequest = {
  workspace_root?: string;
  skills?: readonly SkillId[];
  /** Permission/supervision posture; drives the shell gate in the command
   *  backend (RFC `permission modes`). Defaults to `accept-edits`. */
  mode?: AgentMode;
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
    /**
     * The session's scratch dir (WG `scratch.md`): a per-session ephemeral
     * working area the shell may `cd`/write into though it is NOT a workspace
     * (S5). Threaded onto the command backend as an additional allowed cwd root
     * and surfaced on the returned `command` binding so the agent can be told
     * its path. Absent ⇒ no scratch reach (the command stays workspace-only).
     */
    scratch_dir?: string;
  }
): Promise<{
  fs: AgentFs;
  todos: AgentTodos;
  command?: {
    backend: ReturnType<typeof createAgentCommandBackend>;
    default_workdir: string;
    /** Real path of the session scratch dir, when wired — the agent reaches it
     *  via the shell and is told it through the scratch capability hint. */
    scratch_dir?: string;
    needs_approval?: (input: { command: string; args: string[] }) => boolean;
  };
} | null> {
  if (!req.workspace_root) return null;
  const workspace = await deps.workspace_registry.findByRoot(
    req.workspace_root
  );
  if (!workspace) {
    throw new Error(`workspace not found for root: ${req.workspace_root}`);
  }
  // GRIDA-SEC-004 — the workspace-bound agent fs refuses no-clobber writes
  // (`.git`, lockfiles, rc files, …). The standalone/client-resolved fs gets no
  // guard, so its behavior is unchanged.
  const fs = new AgentFs(new WorkspaceAgentFsBackend(workspace), {
    write_guard: isProtectedWrite,
  });
  await fs.hydrate();
  const todos = new AgentTodos();
  // GRIDA-SEC-004 fail-closed: only wire shell execution when the host
  // affirmed containment (or an explicit unsandboxed opt-in). Otherwise the
  // workspace still gets fs + todos, but no `run_command`.
  const mode = req.mode ?? AGENT_DEFAULT_MODE;
  const command = deps.shell_execution_allowed
    ? {
        backend: createAgentCommandBackend(
          deps.workspace_registry,
          deps.secrets_root ? [deps.secrets_root] : [],
          // Scratch is a sanctioned cwd root though it is not a workspace (S5).
          deps.scratch_dir ? [deps.scratch_dir] : [],
          // Flush the agent fs's pending writes before a command runs, so a
          // script the agent just wrote via write_file is on disk when the
          // shell reads it (closes the debounced-write vs immediate-read race).
          () => fs.flush()
        ),
        default_workdir: req.workspace_root,
        scratch_dir: deps.scratch_dir,
        // Supervised gate (RFC `permission modes`, Phase 2). In `accept-edits`
        // a non-read-only command pauses for Allow/Deny (the tool's
        // `needsApproval`); a read-only inspection command still auto-runs. In
        // `auto` the predicate is absent — every command runs without asking.
        needs_approval:
          mode === "accept-edits"
            ? ({ command, args }: { command: string; args: string[] }) =>
                !isReadOnlyCommand(command, args)
            : undefined,
      }
    : undefined;
  return { fs, todos, command };
}

export class WorkspaceAgentFsBackend implements AgentFs.Backend {
  constructor(private readonly workspace: Workspace) {}

  /**
   * Enumerate the workspace tree for hydration (issue #786). The scan is
   * BOUNDED: it skips well-known heavy/generated directories (`node_modules`,
   * `.git`, build output — see `workspaces/scan`) and stops at a file-count /
   * depth cap. An unbounded walk over a real repo returns hundreds of
   * thousands to millions of paths, which the downstream read fan-out then
   * tries to slurp at once — the OOM / "Too many elements passed to
   * Promise.all" failure this guards against.
   */
  async list(): Promise<string[]> {
    const out: string[] = [];
    const truncated = await this.walk("", 0, out);
    if (truncated) {
      console.warn(
        `[agent-fs] workspace hydrate scan hit a cap at ${this.workspace.root} ` +
          `(${SCAN_MAX_FILES}-file / depth-${SCAN_MAX_DEPTH}); the agent's initial ` +
          `file list is truncated. It can still read any path on demand via the shell.`
      );
    }
    return out;
  }

  async read(path: string): Promise<string | null> {
    try {
      const result = await workspaceFs.readFile(
        this.workspace,
        this.toRel(path)
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

  async readBytes(path: string): Promise<Uint8Array | null> {
    try {
      // `readFileBytes` is the containment-checked raw-bytes read (built for
      // the workspace image viewer); it serves binary that `read` refuses.
      // Read up to the vision tool's own cap (not the viewer's 1 MiB default),
      // so an ordinary 1–8 MiB workspace screenshot is actually viewable rather
      // than being rejected and surfacing as not_found. The vision layer applies
      // the final size gate; anything past the cap surfaces as absent here.
      const { base64 } = await workspaceFs.readFileBytes(
        this.workspace,
        this.toRel(path),
        { max_bytes: AgentVision.MAX_BYTES }
      );
      return new Uint8Array(Buffer.from(base64, "base64"));
    } catch (err) {
      // An oversize file is NOT absent — surface it so view_image returns the
      // typed too_large refusal rather than a misleading not_found. Checked
      // before isAbsentForRead (which folds file-too-large into null).
      if (isWorkspaceFsCode(err, "file-too-large")) {
        const size =
          err instanceof workspaceFs.Exception
            ? (err.detail as { size?: number }).size
            : undefined;
        throw new AgentVision.OversizeError(size);
      }
      if (isAbsentForRead(err)) return null;
      throw err;
    }
  }

  async write(path: string, content: string): Promise<void> {
    await workspaceFs.writeFile(this.workspace, this.toRel(path), content);
  }

  async delete(path: string): Promise<void> {
    try {
      await workspaceFs.deleteFile(this.workspace, this.toRel(path));
    } catch (err) {
      // Deleting something that isn't a deletable file (missing, or a
      // directory) is a no-op for the backend contract; policy violations
      // still throw.
      if (isNotFound(err) || isWorkspaceFsCode(err, "not-a-file")) return;
      throw err;
    }
  }

  /**
   * Map an agent-fs path to a workspace-relative path. The agent mixes two
   * path spaces: the fs tools' logical "/"-rooted form (where "/" is the
   * workspace root, e.g. `/chart.svg`) AND — once it can see the shell's cwd —
   * the REAL absolute path inside the workspace (`<root>/chart.svg`). Both must
   * resolve to the same file, or a `write_file(<abs>)` followed by a shell
   * `python3 chart.py` reads from a different place than it was written (the
   * file would otherwise land under a doubled `<root>/<root>/…` path). The
   * downstream `workspaceFs` containment check still rejects anything that
   * escapes the root.
   */
  private toRel(p: string): string {
    if (!p.startsWith("/")) {
      throw new Error(`agent-fs path must start with "/": ${p}`);
    }
    const root = this.workspace.root;
    if (p === root) return "";
    if (p.startsWith(root + "/")) return p.slice(root.length + 1);
    // Logical "/"-rooted path, relative to the workspace root.
    return p.slice(1);
  }

  /**
   * Depth-first, in-order walk that appends file paths to `out` and returns
   * whether the scan was TRUNCATED (hit the file or depth cap somewhere). The
   * two caps differ in reach: the file cap is global — once `out` is full every
   * frame unwinds via the loop-top guard — while the depth cap is per-branch:
   * a too-deep subtree is skipped but its shallower siblings are still walked.
   * Both surface as a `true` return so the caller can warn once.
   *
   * Sequential (not the prior per-level `Promise.all`) so the cap is honored
   * deterministically and the walk never holds more than one open `readDir`
   * per level — on a huge tree the parallel version's fan-out was itself a
   * source of fd / memory pressure. `readDir` is cheap; with the heavy dirs
   * skipped, a normal repo's hundreds of directories cost a few ms.
   *
   * A directory we can't read (a permission error, or a race where it vanished
   * between listing and descent) is skipped, not fatal: one unreadable corner
   * of the tree must not abort the whole hydrate.
   */
  private async walk(
    relPath: string,
    depth: number,
    out: string[]
  ): Promise<boolean> {
    if (depth > SCAN_MAX_DEPTH) return true;
    let entries: workspaceFs.Entry[];
    try {
      entries = await workspaceFs.readDir(this.workspace, relPath);
    } catch (err) {
      console.warn(
        `[agent-fs] workspace hydrate scan skipped ${relPath || "/"}:`,
        err
      );
      return false;
    }
    let truncated = false;
    for (const entry of entries) {
      if (out.length >= SCAN_MAX_FILES) return true;
      if (entry.kind === "directory") {
        // Skip heavy/generated subtrees (node_modules, .git, build output, …).
        if (isIgnoredScanDir(entry.name)) continue;
        if (await this.walk(entry.rel_path, depth + 1, out)) truncated = true;
        continue;
      }
      if (entry.kind === "file" || entry.kind === "symlink") {
        // Skip known-binary files: `read()` returns null for them, so they
        // never hydrate — counting them toward SCAN_MAX_FILES would let a
        // binary-heavy subtree (an `assets/` of images) starve the real
        // source files that sort after it. See `workspaces/scan`.
        if (isIgnoredScanFile(entry.name)) continue;
        out.push("/" + entry.rel_path.replace(/\\/g, "/"));
      }
    }
    return truncated;
  }
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
