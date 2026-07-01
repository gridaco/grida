/**
 * GRIDA-SEC-004 — workspace-bound agent bindings.
 *
 * Converts an opened workspace into the agent's storage and command
 * capabilities. Runtime orchestration decides when to call this; this
 * module only adapts contracts.
 */

import path from "node:path";
import { realpath } from "node:fs/promises";
import { generateImage } from "ai";
import { AgentFs } from "../fs";
import { containsPath } from "../path-contains";
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
    /**
     * The catalog model id `generate_image` produces with — the USER's selected
     * image model (settings), host-owned config, NOT an agent argument (the tool
     * is prompt-only). Omit to use the catalog default ({@link defaultImageModelId}).
     */
    image_model_id?: string;
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
  // Normalize the scratch root to its REAL path ONCE, here, so every surface
  // (fs reach, shell allowed-roots, the capability hint) agrees with the
  // realpath-based containment `workspaceFs` enforces. `workspace.root` is
  // already realpath'd by the registry; the runtime-derived scratch dir is NOT,
  // so on a platform where the temp dir is symlinked (macOS `/var`→`/private/var`)
  // a raw scratch root makes `workspaceFs`'s realpath check reject every scratch
  // path as an escape — the bug a live run surfaced (`path-escapes-workspace`).
  // The dir exists by now (the runtime ensures it before the turn); fall back to
  // the raw path if realpath can't resolve it.
  const scratchDir = deps.scratch_dir
    ? await realpath(deps.scratch_dir).catch(() => deps.scratch_dir!)
    : undefined;
  // GRIDA-SEC-004 — the workspace-bound agent fs refuses no-clobber writes
  // (`.git`, lockfiles, rc files, …). The standalone/client-resolved fs gets no
  // guard, so its behavior is unchanged.
  // Scratch is reachable by the fs tools (read_file/write_file/view_image),
  // NOT just the shell — the same scratch root the command backend gets below
  // (one source of truth for reach). So the agent can view/read what it
  // generated into scratch without first promoting it to the workspace.
  const fs = new AgentFs(
    new WorkspaceAgentFsBackend(
      workspace,
      scratchDir ? [{ id: "scratch", root: scratchDir }] : []
    ),
    { write_guard: isProtectedWrite }
  );
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
          scratchDir ? [scratchDir] : [],
          // Flush the agent fs's pending writes before a command runs, so a
          // script the agent just wrote via write_file is on disk when the
          // shell reads it (closes the debounced-write vs immediate-read race).
          () => fs.flush()
        ),
        default_workdir: req.workspace_root,
        scratch_dir: scratchDir,
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
  if (deps.image_gen_enabled && deps.secrets && scratchDir) {
    const secrets = deps.secrets;
    if (await hasUsableImageProvider({ secrets })) {
      image_gen = createImageGenerator(
        secrets,
        scratchDir,
        // Same reader `view_image` uses — so an i2i reference path honors the
        // identical scoping + size cap as perceiving that file.
        fs,
        deps.image_model_id
      );
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
  scratchDir: string,
  reader: AgentVision.ByteReader,
  imageModelId?: string
): AgentGen.ImageGenerator {
  return {
    async generate(input) {
      // The user's connected model (settings), not the agent's concern. The
      // tool is prompt-only — no model/provider/size/aspect/seed knobs.
      const modelId = imageModelId ?? defaultImageModelId();
      if (!modelId) {
        return {
          ok: false,
          reason: "unavailable",
          message: "No image model is available.",
        };
      }
      // Image-to-image when the host supplied reference images (the curated
      // board's pins). The model-facing tool stays prompt-only; references are
      // resolved below and ride our internal `grida` provider-options namespace,
      // which the BYOK adapter maps to the provider's own field.
      const wantsRefs = (input.references?.length ?? 0) > 0;
      let resolved;
      try {
        resolved = await resolveImageModel(
          { secrets },
          modelId,
          wantsRefs ? { references: true } : {}
        );
      } catch (e) {
        if (e instanceof ImageModelUnavailableError) {
          return {
            ok: false,
            reason: "unavailable",
            message: wantsRefs
              ? `No connected provider can generate "${modelId}" with reference images (image-to-image). Ask the user to connect an image-provider key that supports it.`
              : `No connected provider can generate "${modelId}". Ask the user to connect an image-provider key in settings.`,
          };
        }
        throw e;
      }
      // Resolve each reference to something a provider can ingest. The caller
      // passes dumb inputs — a workspace path, an https URL, or a data URL — and
      // the host resolves them (a path is read + inlined; a URL passes through),
      // trimmed to the route's advertised cap. An unresolvable reference fails
      // fast with a clear, typed message instead of an opaque provider error.
      let references: string[] | undefined;
      if (wantsRefs) {
        const capped = input.references!.slice(
          0,
          resolved.references_max ?? input.references!.length
        );
        try {
          references = await Promise.all(
            capped.map((ref) => resolveReference(ref, reader))
          );
        } catch (e) {
          if (e instanceof ReferenceResolveError) {
            return { ok: false, reason: "invalid_input", message: e.message };
          }
          throw e;
        }
      }
      let generation;
      try {
        // TODO(image-quality): pin a `quality: "medium"` default for gpt-image-2
        // instead of inheriting the provider default (OpenAI defaults to high/auto
        // → pricier; the catalog's avg_cost_usd is the medium tier). Quality is an
        // OpenAI-specific knob (low|medium|high|auto) and the resolved provider
        // varies (vercel `openai` ns / openrouter `orExtra` / fal `falExtra`), so
        // it must be threaded per-namespace. Track + add later.
        generation = await generateImage({
          model: resolved.model,
          prompt: input.prompt,
          n: 1,
          ...(references ? { providerOptions: { grida: { references } } } : {}),
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
      const filename = `image-${Date.now()}.${extForMime(mime)}`;
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
      // The path + metadata + the base64 `data` for the CLIENT to render the
      // produced image. `data` is NOT lowered to the model — `AgentGen`'s
      // `toModelOutput` is text-only (the model can't be handed pixels through a
      // tool result on the openai-compatible wire format, and doesn't need to
      // "see" what it produced to place it). See the `AgentGen.ImageGenOk` doc.
      return {
        ok: true,
        path: savedPath,
        mime,
        ...(sniffed?.width ? { width: sniffed.width } : {}),
        ...(sniffed?.height ? { height: sniffed.height } : {}),
        bytes: bytes.byteLength,
        data: file.base64,
      };
    },
  };
}

/** A reference (path/URL) the host couldn't turn into provider-ingestible bytes. */
export class ReferenceResolveError extends Error {}

/**
 * Resolve one image-to-image reference to a provider-ingestible URL. The caller
 * passes a dumb input — a file path, an https URL, or a data URL — and gets back
 * something a provider accepts:
 *   - an **https** URL passes straight through (the provider fetches it). `http`
 *     is rejected: the contract is https-only, and the string is serialized
 *     verbatim into the provider request, so we don't let it induce a plaintext
 *     fetch.
 *   - a **data:** URL is decoded and validated exactly like a file (size cap +
 *     image sniff), then re-emitted canonically — so a non-image or oversized
 *     data URL can't skip the checks a path gets and reach `generateImage()`.
 *   - a **path** is read via the shared vision {@link AgentVision.ByteReader}
 *     (same scoping + size cap as `view_image`) and inlined as a base64 data URL.
 * Throws {@link ReferenceResolveError} with an agent-readable message when a
 * reference can't be resolved (empty, not found, too large, or not an image).
 */
export async function resolveReference(
  ref: string,
  reader: AgentVision.ByteReader
): Promise<string> {
  const r = ref.trim();
  if (!r) throw new ReferenceResolveError("a reference is empty.");
  if (/^https:\/\//i.test(r)) return r;

  // A data: URL and a workspace path both resolve to raw bytes that go through
  // the SAME size + image-sniff validation before a provider ever sees them.
  // Every error below is returned to the AGENT, so never echo the raw ref — a
  // `data:` URL is an inline base64 payload (KBs of noise / possible leak) and a
  // long path bloats context. `label` is a safe, bounded summary.
  const label = describeReference(r);
  let bytes: Uint8Array | null;
  if (/^data:/i.test(r)) {
    bytes = decodeDataUrl(r);
    if (!bytes) {
      throw new ReferenceResolveError(
        `reference ${label} is not a valid data URL.`
      );
    }
  } else {
    try {
      bytes = await reader.readBytes(r);
    } catch (e) {
      if (e instanceof AgentVision.OversizeError) {
        throw new ReferenceResolveError(
          `reference ${label} is too large (limit ${AgentVision.MAX_BYTES} bytes).`
        );
      }
      throw new ReferenceResolveError(`reference ${label} could not be read.`);
    }
    if (!bytes) {
      throw new ReferenceResolveError(
        `reference ${label} was not found — pass a workspace file path, an https URL, or a data URL.`
      );
    }
  }
  if (bytes.byteLength > AgentVision.MAX_BYTES) {
    throw new ReferenceResolveError(
      `reference ${label} is ${bytes.byteLength} bytes; the limit is ${AgentVision.MAX_BYTES}.`
    );
  }
  const sniffed = AgentVision.sniff(bytes);
  if (!sniffed) {
    throw new ReferenceResolveError(
      `reference ${label} is not a supported image (png, jpeg, webp, or gif).`
    );
  }
  return `data:${sniffed.mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

/** A safe, bounded label for a reference in an agent-visible error: a `data:`
 *  URL collapses to `"data URL"` (never echo its inline payload), everything
 *  else is quoted and truncated. */
function describeReference(ref: string): string {
  if (/^data:/i.test(ref)) return "a data URL";
  return JSON.stringify(ref.length > 160 ? `${ref.slice(0, 157)}...` : ref);
}

/** Decode a `data:` URL's payload to bytes, or null if malformed. Handles both
 *  `;base64` and percent-encoded payloads. */
function decodeDataUrl(url: string): Uint8Array | null {
  const m = /^data:([^,]*),(.*)$/is.exec(url);
  if (!m) return null;
  try {
    return /;base64/i.test(m[1])
      ? new Uint8Array(Buffer.from(m[2], "base64"))
      : new Uint8Array(Buffer.from(decodeURIComponent(m[2])));
  } catch {
    return null;
  }
}

export class WorkspaceAgentFsBackend implements AgentFs.Backend {
  constructor(
    private readonly workspace: Workspace,
    /**
     * Additional sanctioned roots the agent may read/write through the fs tools
     * — the session scratch dir today. This is the SAME reach the shell is
     * granted (`additionalAllowedRoots`), so `read_file` / `view_image` /
     * `write_file` see scratch exactly as `run_command` does. Without it, scratch
     * was reachable by the shell but invisible to the structured fs tools — the
     * reach-fragmentation bug this fixes.
     */
    private readonly additionalRoots: ReadonlyArray<workspaceFs.Scope> = []
  ) {}

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
      const { scope, rel } = this.scopeFor(path);
      const result = await workspaceFs.readFile(scope, rel);
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
      const { scope, rel } = this.scopeFor(path);
      const { base64 } = await workspaceFs.readFileBytes(scope, rel, {
        max_bytes: AgentVision.MAX_BYTES,
      });
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
    const { scope, rel } = this.scopeFor(path);
    await workspaceFs.writeFile(scope, rel, content);
  }

  async delete(path: string): Promise<void> {
    try {
      const { scope, rel } = this.scopeFor(path);
      await workspaceFs.deleteFile(scope, rel);
    } catch (err) {
      // Deleting something that isn't a deletable file (missing, or a
      // directory) is a no-op for the backend contract; policy violations
      // still throw.
      if (isNotFound(err) || isWorkspaceFsCode(err, "not-a-file")) return;
      throw err;
    }
  }

  /**
   * Resolve an agent-fs path to the containment SCOPE it belongs to + the path
   * relative to that scope's root. The agent mixes path spaces: the fs tools'
   * logical "/"-rooted form (where "/" is the workspace, e.g. `/chart.svg`) AND
   * the REAL absolute path it sees from the shell cwd (`<root>/chart.svg`, or a
   * scratch path `<scratch>/img.png`). An absolute path inside ANY reachable
   * root (workspace or an additional root like scratch) resolves within THAT
   * root — decided by the same `containsPath` primitive the shell's gate uses,
   * so the two surfaces agree on reach. A logical "/"-rooted path that isn't an
   * on-disk path under a reachable root is workspace-relative (the default
   * space). `workspaceFs`'s own realpath containment still rejects escapes.
   */
  private scopeFor(p: string): { scope: workspaceFs.Scope; rel: string } {
    if (!p.startsWith("/")) {
      throw new Error(`agent-fs path must start with "/": ${p}`);
    }
    for (const scope of [this.workspace, ...this.additionalRoots]) {
      if (p === scope.root) return { scope, rel: "" };
      if (containsPath(scope.root, p)) {
        return { scope, rel: path.relative(scope.root, p) };
      }
    }
    return { scope: this.workspace, rel: p.slice(1) };
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
