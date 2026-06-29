/**
 * GRIDA-SEC-004 — workspace-bound agent bindings.
 *
 * Converts an opened workspace into the agent's storage and command
 * capabilities. Runtime orchestration decides when to call this; this
 * module only adapts contracts.
 */

import { generateImage } from "ai";
import { AgentFs } from "../fs";
import { isProtectedWrite } from "../fs/scope";
import { isReadOnlyCommand } from "../permissions";
import { AgentTodos } from "../todos";
import { AgentVision } from "../vision";
import { AgentGen } from "../gen";
import type { SkillId } from "../agent";
import { AGENT_DEFAULT_MODE, type AgentMode } from "../protocol/mode";
import type { SecretsStore } from "../secrets";
import {
  defaultImageModelId,
  hasUsableImageProvider,
  ImageModelUnavailableError,
  resolveImageModel,
} from "../providers/resolve-image";
import { writeScratchFile } from "../session/scratch";
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
    /**
     * The host's `SecretsStore` (BYOK keys). Needed to build the image
     * generator (`generate_image`); credentials never leave the package. Absent
     * on paths that don't generate media.
     */
    secrets?: SecretsStore;
    /**
     * Whether the host enables image generation (its `images` server
     * capability). With it off, no `generate_image` binding is built — the host
     * decides the modality is available, exactly as it gates the HTTP route.
     */
    image_gen_enabled?: boolean;
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
  /** Image generator backing `generate_image`, when a provider key + scratch
   *  sink are available (S3: produced files land in scratch). */
  image_gen?: AgentGen.ImageGenerator;
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
  // Image generation (`generate_image`): wired only when the host enabled the
  // modality, a scratch sink exists (produced bytes land there — S3), and the
  // user actually holds a provider key. The last check mirrors vision's
  // `bytesReadable` gate — never advertise a producer that would refuse every
  // call. The async key probe is cheap (a file read of auth.json).
  let image_gen: AgentGen.ImageGenerator | undefined;
  if (deps.image_gen_enabled && deps.secrets && deps.scratch_dir) {
    const secrets = deps.secrets;
    const scratchDir = deps.scratch_dir;
    if (await hasUsableImageProvider({ secrets })) {
      image_gen = createImageGenerator(secrets, scratchDir);
    }
  }
  return { fs, todos, command, image_gen };
}

/** File extension for a produced image's media type (best-effort). */
function extForMime(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "img";
  }
}

/**
 * Build the node-only image generator the `generate_image` tool resolves
 * against (`AgentGen.ImageGenerator`). It resolves the user's provider for the
 * model, calls the AI SDK, writes the bytes into scratch (the default sink), and
 * returns the path + base64 so the tool can both promote the file and lower the
 * pixels to a media block. Expected failures (no key, provider error) come back
 * as the typed `ok: false` — never thrown into the agent loop.
 *
 * NB billing (#908): like `/images/generate`, this calls `generateImage` WITHOUT
 * `providerOptions.grida`, so the user's own key pays the provider and no Grida
 * credit is metered. Do not add `providerOptions.grida` here.
 */
function createImageGenerator(
  secrets: SecretsStore,
  scratchDir: string
): AgentGen.ImageGenerator {
  return {
    async generate(input) {
      const modelId = input.model_id ?? defaultImageModelId();
      if (!modelId) {
        return {
          ok: false,
          reason: "unavailable",
          message: "No image model is available.",
        };
      }
      let resolved;
      try {
        resolved = await resolveImageModel(
          { secrets },
          modelId,
          input.provider ? { explicit: input.provider } : {}
        );
      } catch (e) {
        if (e instanceof ImageModelUnavailableError) {
          return {
            ok: false,
            reason: "unavailable",
            message: `No connected provider can generate "${modelId}". Ask the user to connect an image-provider key in settings.`,
          };
        }
        throw e;
      }
      let generation;
      try {
        generation = await generateImage({
          model: resolved.model,
          prompt: input.prompt,
          n: 1,
          ...(input.size ? { size: input.size as `${number}x${number}` } : {}),
          ...(input.aspect_ratio
            ? { aspectRatio: input.aspect_ratio as `${number}:${number}` }
            : {}),
          ...(input.seed !== undefined ? { seed: input.seed } : {}),
        });
      } catch (e) {
        // Upstream detail (may embed provider body text) stays in the sidecar
        // log only; the model gets a generic, actionable message.
        const detail = e instanceof Error ? e.message : String(e);
        console.error(
          `[agent-host-image-gen] generation failed provider=${resolved.provider_id} model=${modelId}: ${detail}`
        );
        return {
          ok: false,
          reason: "generation_failed",
          message: "Image generation failed — the provider returned an error.",
        };
      }
      const file = generation.images[0];
      if (!file) {
        return {
          ok: false,
          reason: "generation_failed",
          message: "The provider returned no image.",
        };
      }
      const bytes = file.uint8Array;
      // Sniff for the honest mime + dimensions; fall back to the provider's
      // declared media type when the format isn't one we parse.
      const sniffed = AgentVision.sniff(bytes);
      const mime = sniffed?.mime ?? file.mediaType;
      const filename =
        input.filename ?? `image-${Date.now()}.${extForMime(mime)}`;
      let savedPath: string;
      try {
        savedPath = await writeScratchFile(scratchDir, filename, bytes);
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        console.error(`[agent-host-image-gen] scratch write failed: ${detail}`);
        return {
          ok: false,
          reason: "generation_failed",
          message: "Could not save the generated image to scratch.",
        };
      }
      // Producer, not perceiver: return the path + metadata, never the bytes.
      // The file lives in scratch; the model can't be handed pixels through a
      // tool result on the openai-compatible wire format anyway (see AgentGen).
      return {
        ok: true,
        path: savedPath,
        mime,
        ...(sniffed?.width ? { width: sniffed.width } : {}),
        ...(sniffed?.height ? { height: sniffed.height } : {}),
        bytes: bytes.byteLength,
      };
    },
  };
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
