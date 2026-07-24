/**
 * `@grida/agent/fs` — a real-fs-shaped facade for AI agents to read,
 * edit, and write files against either live state (an editor, a doc model)
 * or pure storage (notes, sketches, scratch).
 *
 * The public surface is grouped under a single `AgentFs` identifier:
 * the class (the runtime fs) and a same-named namespace (its types,
 * tool table, dispatcher, and default in-memory backend). Consumers
 * import one symbol and reach everything via member access — no flat
 * grab-bag of helpers.
 *
 *   import { AgentFs } from "@grida/agent/fs";
 *
 *   const fs = new AgentFs(new AgentFs.MemoryBackend());
 *   const binding: AgentFs.LiveBinding = ...;
 *   fs.mount("/canvas.svg", binding);
 *
 *   const r: AgentFs.ReadResult | null = fs.read("/canvas.svg");
 *   const w: AgentFs.WriteResult = fs.write("/canvas.svg", {
 *     content: "...",
 *     expected_version: null,
 *   });
 *
 *   // AI-SDK tool table + dispatcher
 *   const tools = AgentFs.tools;
 *   const output = AgentFs.resolveToolCall(fs, toolCall);
 *
 * Env-restricted backends (`./backends/opfs`, `./backends/node`) live
 * under their own subpaths so a bare `import "@grida/agent/fs"`
 * never pulls `navigator.storage` or `node:fs`. They implement
 * `AgentFs.Backend`.
 *
 * See `./README.md` for the full contract.
 */

import { tool } from "ai";
import { z } from "zod";
import { findMatches, applyReplacements } from "./internal/match";

// ---------------------------------------------------------------------------
// Module-private state shape (not part of the public namespace).
// ---------------------------------------------------------------------------

type FileEntry = {
  content: string;
  version: number;
};

type DirectoryEntries = {
  folders: string[];
  files: string[];
};

const PATH_DESCRIPTION =
  "Absolute path in the agent filesystem, starting with `/`. " +
  "Examples: `/canvas.svg`, `/notes/draft.md`.";

/**
 * Max concurrent backend reads during `hydrate()` (issue #786). A small fixed
 * width: enough to keep disk/IPC busy, low enough to never approach the OS fd
 * limit or V8's promise-combinator element cap even when the backend lists a
 * whole repo. The enumeration side is also bounded (workspace backend caps the
 * path list), so this is defense in depth: any backend handing back a large
 * list reads safely.
 */
const HYDRATE_READ_CONCURRENCY = 24;
const LIST_DIRECTORY_DEFAULT_LIMIT = 200;
const LIST_DIRECTORY_MAX_LIMIT = 1000;
const MODEL_TEXT_FILE_MAX_BYTES = 1_048_576;

function utf8ByteLength(content: string): number {
  let bytes = 0;
  for (let i = 0; i < content.length; i++) {
    const code = content.charCodeAt(i);
    if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (
      code >= 0xd800 &&
      code <= 0xdbff &&
      i + 1 < content.length &&
      content.charCodeAt(i + 1) >= 0xdc00 &&
      content.charCodeAt(i + 1) <= 0xdfff
    ) {
      bytes += 4;
      i += 1;
    } else {
      // Three bytes covers BMP code points and TextEncoder's U+FFFD
      // replacement for an unpaired surrogate.
      bytes += 3;
    }
  }
  return bytes;
}

function textSizeFailure(
  path: string,
  content: string,
  maxBytes: number
): { ok: false; reason: "too_large"; message: string } | null {
  const bytes = utf8ByteLength(content);
  if (bytes <= maxBytes) return null;
  return {
    ok: false,
    reason: "too_large",
    message: `File at ${path} is ${bytes} UTF-8 bytes; the text file limit is ${maxBytes} bytes.`,
  };
}

function normalizeDirectoryPath(path: string | undefined): string {
  const raw = path?.trim();
  if (!raw || raw === "." || raw === "./" || raw === "*") return "/";
  const rooted = raw.startsWith("/") ? raw : `/${raw}`;
  const collapsed = rooted.replace(/\/+/g, "/");
  if (collapsed === "/") return "/";
  return collapsed.replace(/\/+$/, "");
}

function normalizeListOffset(offset: number | undefined): number {
  if (offset === undefined || !Number.isFinite(offset)) return 0;
  return Math.max(0, Math.trunc(offset));
}

function normalizeListLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return LIST_DIRECTORY_DEFAULT_LIMIT;
  }
  return Math.max(1, Math.min(Math.trunc(limit), LIST_DIRECTORY_MAX_LIMIT));
}

function collectDirectoryEntries(
  paths: Iterable<string>,
  path: string
): DirectoryEntries {
  const prefix = path === "/" ? "/" : `${path}/`;
  const folders = new Set<string>();
  const files = new Set<string>();

  for (const filePath of paths) {
    if (!filePath.startsWith(prefix)) continue;
    const rest = filePath.slice(prefix.length);
    if (rest.length === 0) continue;
    const slash = rest.indexOf("/");
    if (slash === -1) {
      files.add(filePath);
    } else {
      folders.add(`${prefix}${rest.slice(0, slash)}`);
    }
  }

  return {
    folders: [...folders].sort(),
    files: [...files].sort(),
  };
}

function mergeDirectoryEntries(
  a: DirectoryEntries,
  b: DirectoryEntries
): DirectoryEntries {
  return {
    folders: [...new Set([...a.folders, ...b.folders])].sort(),
    files: [...new Set([...a.files, ...b.files])].sort(),
  };
}

function pageDirectoryEntries(
  path: string,
  entries: DirectoryEntries,
  args: AgentFs.ListArgs
): AgentFs.ListResult {
  const offset = normalizeListOffset(args.offset);
  const limit = normalizeListLimit(args.limit);
  const ordered: Array<{ type: "folder" | "file"; path: string }> = [
    ...entries.folders.map((p) => ({ type: "folder" as const, path: p })),
    ...entries.files.map((p) => ({ type: "file" as const, path: p })),
  ];
  const page = ordered.slice(offset, offset + limit);
  const truncated = offset + limit < ordered.length;

  return {
    path,
    folders: page.filter((e) => e.type === "folder").map((e) => e.path),
    files: page.filter((e) => e.type === "file").map((e) => e.path),
    truncated,
    ...(truncated ? { next_offset: offset + limit } : {}),
  };
}

/**
 * `Promise.allSettled`-shaped map with a fixed in-flight width. Results are
 * positionally aligned to `items` (so a downstream `items[i]` ↔ `results[i]`
 * loop is valid). Unlike `Promise.allSettled(items.map(fn))`, only `limit`
 * calls to `fn` are ever pending at once, and the only `Promise.all` is over
 * `limit` workers — a small constant — so a huge `items` can't overflow the
 * combinator's element cap.
 */
async function mapSettledBounded<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = Array.from({
    length: items.length,
  });
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i]) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  };
  const width = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: width }, () => worker()));
  return results;
}

// ---------------------------------------------------------------------------
// AgentFs — the class.
//
// Methods qualify all public-surface types via `AgentFs.X` (e.g.
// `AgentFs.LiveBinding`) so the class body and the namespace below
// stay obviously consistent. Declaration merging guarantees the
// namespace's members are visible to the class.
// ---------------------------------------------------------------------------

/**
 * `AgentFs` — a real-fs-shaped facade over a `LiveBinding` (e.g. an SVG
 * editor) and an `AgentFs.Backend` (in-memory / OPFS / Node disk).
 *
 * Design goals:
 *  - **Multi-file.** Paths are first-class. Single-file constraints belong
 *    at the call site, not in the fs.
 *  - **Content-agnostic.** The fs never inspects bytes. Formatting,
 *    parsing, schema validation are the binding's concern.
 *  - **No React.** Pure TypeScript; testable end-to-end in Node.
 *  - **Mirrors real fs ops.** `read` / `write` / `edit` / `delete` /
 *    `list` / `exists`, with a `mount` hook for paths backed by live
 *    state.
 *  - **Safety contract.** Match-and-replace edits validate their context
 *    against the file's current content when the operation executes. A
 *    session-local "read" record is never treated as write authority.
 *
 * Two file shapes share the API:
 *
 *  - **Bound files.** `mount(path, binding)` ties a path to an
 *    `AgentFs.LiveBinding`. `read` and `write` go through the binding;
 *    `getVersion()` is an internal host freshness token, not a model-facing
 *    credential. The backend persists a serialized snapshot; on `hydrate()`
 *    we load it via `binding.load()`.
 *
 *  - **Pure files.** Anything not mounted. Stored in memory as
 *    `{content, version}` (version starts at 0, bumps per write). Useful
 *    for notes / sketches / scratch — anything the agent wants to keep
 *    across turns without it touching live editor state.
 *
 * **Mount before hydrate** wherever possible: that lets `hydrate()` load
 * persisted bytes directly into the live binding instead of into the
 * pure-file map (which would be wrong — the binding would be ignored).
 */
export class AgentFs {
  private readonly flush_debounce_ms: number;
  private readonly bindings = new Map<string, AgentFs.LiveBinding>();
  private readonly binding_unsubs = new Map<string, () => void>();
  private readonly files = new Map<string, FileEntry>();
  /** Last content sent to the backend per path. Avoids redundant writes. */
  private readonly last_flushed = new Map<string, string>();
  private readonly flush_queue = new Set<string>();
  private flush_timer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Debounced flushes may already be awaiting backend I/O when another
   * operation asks to flush. Join them instead of starting a second writer:
   * otherwise an older write can finish after a newer server-bound mutation.
   */
  private flush_tail: Promise<boolean> = Promise.resolve(true);
  private disposed = false;
  private hydrate_promise: Promise<void> | null = null;
  private readonly watchers = new Set<AgentFs.Listener>();
  /**
   * Server-bound filesystem operations and commands share this FIFO. AI SDK
   * tool calls may execute concurrently; registration order must still
   * preserve a write → edit → command sequence against one workspace.
   */
  private operation_tail: Promise<void> = Promise.resolve();

  private readonly write_guard?: AgentFs.Options["write_guard"];

  constructor(
    private readonly backend: AgentFs.Backend,
    opts: AgentFs.Options = {}
  ) {
    const readsRevisions = typeof backend.readWithRevision === "function";
    const writesRevisions = typeof backend.writeIfRevision === "function";
    if (readsRevisions !== writesRevisions) {
      throw new Error(
        "AgentFs backend revision support must provide readWithRevision and writeIfRevision together."
      );
    }
    this.flush_debounce_ms = opts.flush_debounce_ms ?? 500;
    this.write_guard = opts.write_guard;
  }

  // -------------------------------------------------------------------------
  // Mounting
  // -------------------------------------------------------------------------

  /**
   * Bind a path to live, externally-managed state. If the path is already
   * mounted, the previous binding is replaced (its subscription torn down).
   */
  mount(path: string, binding: AgentFs.LiveBinding): void {
    if (this.disposed) return;
    this.unmount(path);
    this.bindings.set(path, binding);
    // If a pure-file entry shadowed this path (typically because
    // `hydrate()` ran before `mount()` and parked persisted bytes in
    // the file map), hand that snapshot to the binding before dropping
    // it. Without this, attaching a binding after async init would
    // silently discard the persisted document.
    const existing = this.files.get(path);
    this.files.delete(path);
    if (existing) {
      try {
        binding.load(existing.content);
        this.last_flushed.set(path, existing.content);
      } catch (err) {
        console.warn(
          `[agent-fs] binding.load(${path}) failed during mount:`,
          err
        );
      }
    }
    if (binding.subscribe) {
      const unsub = binding.subscribe(() => this.queueFlush(path));
      this.binding_unsubs.set(path, unsub);
    }
  }

  unmount(path: string): void {
    const unsub = this.binding_unsubs.get(path);
    if (unsub) {
      unsub();
      this.binding_unsubs.delete(path);
    }
    this.bindings.delete(path);
    // Clear per-path bookkeeping so repeated mount/unmount cycles don't
    // grow the maps unboundedly.
    this.last_flushed.delete(path);
  }

  // -------------------------------------------------------------------------
  // Persistence lifecycle
  // -------------------------------------------------------------------------

  /**
   * Load every persisted path from the backend. Mounted paths get their
   * content fed into `binding.load(...)`; everything else materializes as
   * a pure file. Idempotent — concurrent / repeated calls return the same
   * promise.
   *
   * On a `backend.list()` or per-path read failure: logs and continues,
   * so a bad blob can't take down the agent. The fs is still usable; the
   * affected path stays empty until the next write.
   */
  async hydrate(): Promise<void> {
    if (this.hydrate_promise) return this.hydrate_promise;
    this.hydrate_promise = this.runHydrate();
    return this.hydrate_promise;
  }

  private async runHydrate(): Promise<void> {
    let paths: string[];
    try {
      paths = await this.backend.list();
    } catch (err) {
      console.warn("[agent-fs] backend.list failed:", err);
      return;
    }
    // Fan out reads with BOUNDED concurrency (issue #786). The old
    // `Promise.allSettled(paths.map(read))` issued one read per path at once:
    // on a large backend (a real workspace tree) that exhausts file
    // descriptors, and a long-enough list overflows V8's promise-combinator
    // element cap ("Too many elements passed to Promise.all"). A fixed-width
    // worker pool keeps in-flight reads constant regardless of list size. The
    // apply-to-state step that follows must stay sequential (binding.load +
    // Map mutations aren't reentrant).
    const reads = await mapSettledBounded(
      paths,
      HYDRATE_READ_CONCURRENCY,
      (p) => this.backend.read(p)
    );
    for (let i = 0; i < paths.length; i++) {
      if (this.disposed) return;
      const p = paths[i];
      const r = reads[i];
      if (r.status === "rejected") {
        console.warn(`[agent-fs] backend.read(${p}) failed:`, r.reason);
        continue;
      }
      const content = r.value;
      if (content == null) continue;
      const binding = this.bindings.get(p);
      if (binding) {
        try {
          binding.load(content);
        } catch (err) {
          console.warn(
            `[agent-fs] binding.load(${p}) failed during hydrate:`,
            err
          );
          continue;
        }
      } else {
        this.files.set(p, { content, version: 0 });
      }
      this.last_flushed.set(p, content);
    }
  }

  /**
   * Tear down binding subscriptions and cancel any pending flush. The
   * backend itself is *not* told to do anything — its lifetime is
   * managed by the caller.
   */
  dispose(): void {
    this.disposed = true;
    for (const unsub of this.binding_unsubs.values()) unsub();
    this.binding_unsubs.clear();
    if (this.flush_timer) {
      clearTimeout(this.flush_timer);
      this.flush_timer = null;
    }
    this.flush_queue.clear();
    this.watchers.clear();
  }

  // -------------------------------------------------------------------------
  // Watch
  // -------------------------------------------------------------------------

  /**
   * Subscribe to mutation events on this fs. Fires synchronously after a
   * write, edit, or delete commits — including writes routed through a
   * `LiveBinding`. Returns an unsubscribe fn.
   *
   * Listeners receive *every* path's events; filter by `event.path` if
   * you only care about a scope.
   *
   * **Echo discipline.** A listener that itself triggered the mutation
   * (e.g. a doc-store calling `fs.write` and then receiving the resulting
   * event) is responsible for detecting and skipping its own writes. The
   * fs doesn't track origin — that would couple the watcher to the caller
   * graph. Compare `event.version` or read-back content to dedup.
   *
   * **Synchronous, in-call.** Listeners run inside `write` / `edit` /
   * `delete`; throwing from a listener will not corrupt fs state (the
   * mutation is already committed) but will propagate. Wrap risky work
   * in try/catch on your side.
   */
  watch(listener: AgentFs.Listener): () => void {
    if (this.disposed) return () => {};
    this.watchers.add(listener);
    return () => {
      this.watchers.delete(listener);
    };
  }

  private emit(event: AgentFs.Event): void {
    if (this.watchers.size === 0) return;
    // Iterate a snapshot so a listener unsubscribing during dispatch
    // doesn't skip later listeners.
    for (const cb of Array.from(this.watchers)) {
      try {
        cb(event);
      } catch (err) {
        console.warn(`[agent-fs] watch listener threw on ${event.type}:`, err);
      }
    }
  }

  // -------------------------------------------------------------------------
  // File ops
  // -------------------------------------------------------------------------

  /**
   * Returns every path the fs knows about: mounts plus pure files. The
   * backend may know about more (paths persisted in a prior session that
   * we never read this session) — call `hydrate()` first if you need those.
   */
  list(): string[] {
    // Keys are disjoint by construction (`mount()` drops any shadowing
    // pure-file entry; `write()` to a mounted path goes through the binding).
    return [...this.bindings.keys(), ...this.files.keys()];
  }

  /**
   * List direct children under a directory path. Unlike `list()`, this is the
   * model-facing discovery shape: scoped, paginated, and explicit about
   * truncation so the agent never mistakes an index cap for a full inventory.
   */
  list_directory(args: AgentFs.ListArgs = {}): AgentFs.ListResult {
    const path = normalizeDirectoryPath(args.path);
    return pageDirectoryEntries(
      path,
      collectDirectoryEntries(this.list(), path),
      args
    );
  }

  /**
   * Fresh directory listing for server-bound real filesystem backends. Falls
   * back to the hydrated VFS map when the backend cannot list directories
   * directly. In-memory writes/mounts are merged before pagination so a
   * just-written file remains discoverable even inside the debounce window.
   */
  async list_directory_fresh(
    args: AgentFs.ListArgs = {}
  ): Promise<AgentFs.ListResult> {
    const path = normalizeDirectoryPath(args.path);
    let entries = collectDirectoryEntries(this.list(), path);
    if (this.backend.list_directory) {
      try {
        entries = mergeDirectoryEntries(
          entries,
          await this.backend.list_directory(path)
        );
      } catch (err) {
        console.warn(`[agent-fs] backend.list_directory(${path}) failed:`, err);
      }
    }
    return pageDirectoryEntries(path, entries, args);
  }

  exists(path: string): boolean {
    return this.bindings.has(path) || this.files.has(path);
  }

  /**
   * Serialize a server-bound filesystem or command operation with the other
   * operations registered on this fs. The action is enqueued synchronously,
   * before its first await, so concurrent AI-SDK tool executions retain call
   * order. Rejections never poison later operations.
   */
  runExclusive<T>(action: () => Promise<T>): Promise<T> {
    const result = this.operation_tail.then(action, action);
    this.operation_tail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  /**
   * Read the content + current version. Returns `null` for unknown paths
   * (call `hydrate()` first if the file might only exist in the backend).
   */
  read(path: string): AgentFs.ReadResult | null {
    const binding = this.bindings.get(path);
    if (binding) {
      const version = binding.getVersion();
      return { content: binding.serialize(), version };
    }
    const entry = this.files.get(path);
    if (!entry) return null;
    return { content: entry.content, version: entry.version };
  }

  /**
   * Read the backend's current content rather than trusting the hydrate cache.
   * This is the server-bound path for both ordinary workspace files and lazy
   * resources such as a dropped directory reference. A pending local flush
   * completes first, then the returned bytes refresh the local cache.
   */
  async read_fresh(path: string): Promise<AgentFs.ReadResult | null> {
    return this.runExclusive(() => this.readFreshUnlocked(path));
  }

  private async readFreshUnlocked(
    path: string
  ): Promise<AgentFs.ReadResult | null> {
    if (this.bindings.has(path)) return this.read(path);
    // A failed forced flush leaves the newer local snapshot dirty. Do not
    // replace it with older backend bytes; the queued retry still owns
    // persistence of that mutation.
    if (!(await this.flushPending())) return this.read(path);

    let content: string | null;
    try {
      if (this.backend.readWithRevision) {
        const versioned = await this.backend.readWithRevision(path);
        content = versioned?.content ?? null;
      } else {
        content = await this.backend.read(path);
      }
    } catch (err) {
      if (err instanceof AgentFs.TextFileTooLargeError) throw err;
      console.warn(`[agent-fs] backend.read(${path}) failed:`, err);
      throw err;
    }
    if (content === null) {
      this.files.delete(path);
      this.last_flushed.delete(path);
      return null;
    }

    const previous = this.files.get(path);
    const entry = {
      content,
      version:
        previous === undefined
          ? 0
          : previous.content === content
            ? previous.version
            : previous.version + 1,
    };
    this.files.set(path, entry);
    this.last_flushed.set(path, content);
    return entry;
  }

  /**
   * Read the RAW bytes at `path` straight from the backend — bypassing the
   * hydrated text cache (`read`) and any live binding, because an image must
   * never round-trip through a string. Returns `null` when the path is
   * absent OR the backend has no byte view. This is the seam `view_image`
   * (see `../vision`) resolves against; `AgentFs` satisfies
   * `AgentVision.ByteReader` by exposing exactly this method.
   *
   * Perception grants no write authority and provides no textual context for
   * an edit. `edit_file` independently validates its supplied text against the
   * current file content.
   */
  async readBytes(path: string): Promise<Uint8Array | null> {
    return (await this.backend.readBytes?.(path)) ?? null;
  }

  /**
   * Whether this fs can actually serve raw bytes — i.e. its backend implements
   * the optional {@link AgentFs.Backend.readBytes}. Injectors check this before
   * wiring the `view_image` capability (`../vision`): advertising perception
   * over a backend that can't read bytes would degrade every call to
   * `not_found`. `AgentFs` always *has* `readBytes`, so a structural check would
   * lie — this asks the backend.
   */
  get bytesReadable(): boolean {
    return typeof this.backend.readBytes === "function";
  }

  /**
   * Full-content upsert. See {@link AgentFs.WriteArgs} for the
   * `expected_version` semantics (version-checked vs permissive).
   */
  write(path: string, args: AgentFs.WriteArgs): AgentFs.WriteResult {
    const { content, expected_version } = args;
    const guarded = this.mutationFailure(path, "write");
    if (guarded) return guarded;
    if (expected_version !== null) {
      const entry = this.lookup(path);
      if (entry === null) {
        return {
          ok: false,
          reason: "not_found",
          message: `No file at ${path}. Pass expected_version=null to create it.`,
        };
      }
      if (entry.version !== expected_version) {
        return {
          ok: false,
          reason: "stale",
          message: `File at ${path} changed since you last read it. Re-read and retry.`,
          current_version: entry.version,
        };
      }
    }
    return this.commit(path, content);
  }

  /**
   * Persist a server-bound full-file write before reporting success. The
   * model-facing `write_file` is an explicit upsert, so it passes
   * `expected_version: null`; the internal numeric-version path remains for
   * live/client hosts that call {@link write} directly.
   */
  async write_fresh(
    path: string,
    args: AgentFs.WriteArgs
  ): Promise<AgentFs.WriteResult> {
    return this.runExclusive(async () => {
      const guarded = this.mutationFailure(path, "write");
      if (guarded) return guarded;

      // Drain any older debounced snapshot before publishing the newer full
      // write. `flushPending` also joins a flush whose backend write is already
      // in flight.
      if (!(await this.flushPending())) {
        return {
          ok: false,
          reason: "io_error",
          message: `The backing store rejected a pending write before writing ${path}.`,
        };
      }

      if (this.bindings.has(path)) {
        const result = this.write(path, args);
        if (result.ok && !(await this.flushPending())) {
          return {
            ok: false,
            reason: "io_error",
            message: `The backing store rejected the write to ${path}.`,
          };
        }
        return result;
      }

      if (args.expected_version !== null) {
        try {
          await this.readFreshUnlocked(path);
        } catch (err) {
          if (err instanceof AgentFs.TextFileTooLargeError) {
            return {
              ok: false,
              reason: "too_large",
              message: err.message,
            };
          }
          return {
            ok: false,
            reason: "io_error",
            message: `The backing store rejected the read of ${path}.`,
          };
        }
        const current = this.lookup(path);
        if (current === null) {
          return {
            ok: false,
            reason: "not_found",
            message: `No file at ${path}. Pass expected_version=null to create it.`,
          };
        }
        if (current.version !== args.expected_version) {
          return {
            ok: false,
            reason: "stale",
            message: `File at ${path} changed since you last read it. Re-read and retry.`,
            current_version: current.version,
          };
        }
      }

      try {
        await this.backend.write(path, args.content);
      } catch (err) {
        if (err instanceof AgentFs.TextFileTooLargeError) {
          return {
            ok: false,
            reason: "too_large",
            message: err.message,
          };
        }
        console.warn(`[agent-fs] backend.write(${path}) failed:`, err);
        return {
          ok: false,
          reason: "io_error",
          message: `The backing store rejected the write to ${path}.`,
        };
      }
      return this.acceptPersisted(path, args.content);
    });
  }

  /**
   * Match-and-replace edit against the content that is current when this
   * method executes. No prior-read ledger or model-supplied version is
   * consulted: the supplied `old_string` is the edit's precondition.
   *
   * Matching: literal first, then whitespace-normalized — see
   * `findMatches`. Ambiguous matches reject with `reason: "ambiguous"`
   * unless `replace_all` is set.
   */
  edit(
    path: string,
    args: AgentFs.EditArgs,
    options: AgentFs.EditOptions = {}
  ): AgentFs.EditResult {
    const guarded = this.mutationFailure(path, "edit");
    if (guarded) return guarded;
    const entry = this.lookup(path);
    if (entry === null) {
      return {
        ok: false,
        reason: "not_found",
        message: `No file at ${path}.`,
      };
    }

    const derived = this.deriveEdit(
      path,
      entry.content,
      args,
      options.max_bytes
    );
    if (!derived.ok) return derived;

    const committed = this.commit(path, derived.content);
    if (!committed.ok) return committed;
    return { ...committed, occurrences: derived.occurrences };
  }

  /**
   * Server-bound edit: read current bytes and an opaque backend revision,
   * derive the replacement from those bytes, then conditionally publish. A
   * backend without revision support still reads immediately before an
   * awaited write; the shared operation FIFO prevents in-process tool races.
   */
  async edit_fresh(
    path: string,
    args: AgentFs.EditArgs,
    options: AgentFs.EditOptions = {}
  ): Promise<AgentFs.EditResult> {
    return this.runExclusive(async () => {
      const guarded = this.mutationFailure(path, "edit");
      if (guarded) return guarded;

      if (this.bindings.has(path)) {
        const result = this.edit(path, args, options);
        if (result.ok && !(await this.flushPending())) {
          return {
            ok: false,
            reason: "io_error",
            message: `The backing store rejected the edit to ${path}.`,
          };
        }
        return result;
      }

      if (!(await this.flushPending())) {
        return {
          ok: false,
          reason: "io_error",
          message: `The backing store rejected a pending write before editing ${path}.`,
        };
      }
      let current: { content: string; revision?: string } | null;
      try {
        current = this.backend.readWithRevision
          ? await this.backend.readWithRevision(path)
          : null;
        if (current === null && !this.backend.readWithRevision) {
          const content = await this.backend.read(path);
          current = content === null ? null : { content, revision: undefined };
        }
      } catch (err) {
        if (err instanceof AgentFs.TextFileTooLargeError) {
          return {
            ok: false,
            reason: "too_large",
            message: err.message,
          };
        }
        console.warn(`[agent-fs] backend.read(${path}) failed:`, err);
        return {
          ok: false,
          reason: "io_error",
          message: `The backing store rejected the read of ${path}.`,
        };
      }
      if (current === null) {
        this.files.delete(path);
        this.last_flushed.delete(path);
        return {
          ok: false,
          reason: "not_found",
          message: `No file at ${path}.`,
        };
      }

      const derived = this.deriveEdit(
        path,
        current.content,
        args,
        options.max_bytes
      );
      if (!derived.ok) return derived;

      try {
        if (current.revision !== undefined && this.backend.writeIfRevision) {
          const published = await this.backend.writeIfRevision(
            path,
            derived.content,
            current.revision
          );
          if (!published.ok) {
            return {
              ok: false,
              reason: "stale",
              message: `File at ${path} changed while the edit was being applied. Retry against its current content.`,
            };
          }
        } else {
          await this.backend.write(path, derived.content);
        }
      } catch (err) {
        if (err instanceof AgentFs.TextFileTooLargeError) {
          return {
            ok: false,
            reason: "too_large",
            message: err.message,
          };
        }
        console.warn(`[agent-fs] backend.write(${path}) failed:`, err);
        return {
          ok: false,
          reason: "io_error",
          message: `The backing store rejected the edit to ${path}.`,
        };
      }

      const committed = this.acceptPersisted(path, derived.content);
      return { ...committed, occurrences: derived.occurrences };
    });
  }

  private deriveEdit(
    path: string,
    content: string,
    args: AgentFs.EditArgs,
    maxBytes?: number
  ): { ok: true; content: string; occurrences: number } | AgentFs.EditFailure {
    if (maxBytes !== undefined) {
      const oversizedCurrent = textSizeFailure(path, content, maxBytes);
      if (oversizedCurrent) return oversizedCurrent;
    }

    const { old_string, new_string, replace_all } = args;
    if (old_string.length === 0) {
      return {
        ok: false,
        reason: "not_found",
        message: "`old_string` must not be empty.",
      };
    }
    if (old_string === new_string) {
      return {
        ok: false,
        reason: "no_op",
        message: "`old_string` and `new_string` are identical.",
      };
    }

    const ranges = findMatches(content, old_string);
    if (ranges.length === 0) {
      return {
        ok: false,
        reason: "not_found",
        message: `\`old_string\` not found in the current content of ${path}. Read the file for updated context and retry.`,
      };
    }
    if (ranges.length > 1 && !replace_all) {
      return {
        ok: false,
        reason: "ambiguous",
        message: `\`old_string\` matched ${ranges.length} locations in ${path}. Add context to disambiguate or pass replace_all=true.`,
        occurrences: ranges.length,
      };
    }
    const nextContent = applyReplacements(content, ranges, new_string);
    if (maxBytes !== undefined) {
      const oversizedNext = textSizeFailure(path, nextContent, maxBytes);
      if (oversizedNext) return oversizedNext;
    }
    return {
      ok: true,
      content: nextContent,
      occurrences: ranges.length,
    };
  }

  /**
   * Literal substring search across every known file. Mirrors `grep -n -F`:
   * line-oriented, fixed-string, returns one entry per matching line with
   * a 1-indexed line number and the full line text.
   *
   * Bound files are searched via `binding.serialize()` (so the agent sees
   * the same formatted bytes `read()` would return). Empty pattern → empty
   * result. Scope can be narrowed with `path_prefix`.
   *
   * Side-effect-free. Search results identify locations but may not contain
   * enough context to author a unique match-and-replace edit.
   */
  grep(args: AgentFs.GrepArgs): AgentFs.GrepResult {
    const matches: AgentFs.GrepMatch[] = [];
    let scanned = 0;
    const pattern = args.pattern;
    if (pattern.length === 0) return { matches, files_scanned: 0 };

    const ci = args.case_sensitive === false;
    const needle = ci ? pattern.toLowerCase() : pattern;
    const prefix = args.path_prefix ?? null;

    for (const path of this.list()) {
      if (prefix !== null && !path.startsWith(prefix)) continue;
      const entry = this.lookup(path);
      if (entry === null) continue;
      scanned += 1;
      const lines = entry.content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const text = lines[i];
        const haystack = ci ? text.toLowerCase() : text;
        if (haystack.includes(needle)) {
          matches.push({ path, line: i + 1, text });
        }
      }
    }
    return { matches, files_scanned: scanned };
  }

  /**
   * Backend-assisted search for lazily mounted trees. The ordinary in-memory
   * grep still covers hydrated workspace/binding files; an optional backend
   * search contributes paths that were intentionally not hydrated. Paths and
   * matches are de-duplicated because a previously read lazy file may appear
   * in both views.
   */
  async grep_fresh(args: AgentFs.GrepArgs): Promise<AgentFs.GrepResult> {
    const cached = this.grep(args);
    if (!this.backend.grep) return cached;

    let fresh: AgentFs.BackendGrepResult;
    try {
      fresh = await this.backend.grep(args);
    } catch (err) {
      console.warn("[agent-fs] backend.grep failed:", err);
      return cached;
    }

    const scanned = new Set(
      this.list().filter(
        (path) =>
          args.path_prefix === undefined || path.startsWith(args.path_prefix)
      )
    );
    for (const path of fresh.paths_scanned) scanned.add(path);

    const matches: AgentFs.GrepMatch[] = [];
    const seen = new Set<string>();
    for (const match of [...cached.matches, ...fresh.matches]) {
      const key = `${match.path}\0${match.line}\0${match.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push(match);
    }
    matches.sort(
      (a, b) =>
        a.path.localeCompare(b.path) ||
        a.line - b.line ||
        a.text.localeCompare(b.text)
    );
    return { matches, files_scanned: scanned.size };
  }

  /**
   * Remove a pure file from the fs and the backend. Mounted paths can't
   * be deleted through this API — unmount first if you really mean it.
   */
  delete(path: string): AgentFs.DeleteResult {
    if (this.bindings.has(path)) {
      return {
        ok: false,
        reason: "mounted",
        message: `${path} is mounted to a live binding; unmount first.`,
      };
    }
    if (!this.files.has(path)) {
      return {
        ok: false,
        reason: "not_found",
        message: `No file at ${path}.`,
      };
    }
    this.files.delete(path);
    this.last_flushed.delete(path);
    void this.backend.delete(path).catch((err) => {
      console.warn(`[agent-fs] backend.delete(${path}) failed:`, err);
    });
    this.emit({ type: "delete", path });
    return { ok: true };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /** Resolve a path to its current { content, version }, or `null` if missing. */
  private lookup(path: string): { content: string; version: number } | null {
    const binding = this.bindings.get(path);
    if (binding) {
      return { content: binding.serialize(), version: binding.getVersion() };
    }
    const entry = this.files.get(path);
    return entry ? { content: entry.content, version: entry.version } : null;
  }

  /** Convert the host's path mutation policy into the tool result vocabulary. */
  private mutationFailure(
    path: string,
    operation: "write" | "edit"
  ): AgentFs.WriteFailure | null {
    const guarded = this.write_guard?.(path);
    if (!guarded) return null;
    if (guarded !== true) {
      return { ok: false, reason: guarded.reason, message: guarded.message };
    }
    return {
      ok: false,
      reason: "protected",
      message:
        operation === "write"
          ? `${path} is a protected path and can't be written by an edit tool. Use the shell (e.g. git, the package manager) if you need to change it.`
          : `${path} is a protected path and can't be edited by an edit tool. Use the shell if you need to change it.`,
    };
  }

  /**
   * Apply `content` to the path. For bound paths, calls `binding.load()`;
   * for pure paths, updates the in-memory entry and bumps the version.
   * Then schedules a backend flush.
   *
   * On a binding `load()` throw, returns `parse_error` and does NOT
   * advance any state — the next write at the same version still works.
   */
  private commit(path: string, content: string): AgentFs.WriteResult {
    const binding = this.bindings.get(path);
    if (binding) {
      try {
        binding.load(content);
      } catch (err) {
        return parseError(err);
      }
      const v = binding.getVersion();
      this.queueFlush(path);
      this.emit({ type: "write", path, version: v });
      return { ok: true, version: v };
    }
    const result = this.acceptContent(path, content, false);
    this.queueFlush(path);
    return result;
  }

  /**
   * Accept content already persisted by a server-bound operation into the
   * local cache and event stream without scheduling a redundant backend write.
   */
  private acceptPersisted(path: string, content: string): AgentFs.WriteSuccess {
    return this.acceptContent(path, content, true);
  }

  private acceptContent(
    path: string,
    content: string,
    persisted: boolean
  ): AgentFs.WriteSuccess {
    const existing = this.files.get(path);
    const next: FileEntry = {
      content,
      version: (existing?.version ?? 0) + 1,
    };
    this.files.set(path, next);
    if (persisted) this.last_flushed.set(path, content);
    this.emit({ type: "write", path, version: next.version });
    return { ok: true, version: next.version };
  }

  /**
   * Mark a path dirty and (re)arm the flush timer. The timer fires once
   * the writer goes idle (default 500 ms), serializing one
   * `backend.write()` per dirty path.
   */
  private queueFlush(path: string): void {
    if (this.disposed) return;
    this.flush_queue.add(path);
    if (this.flush_timer) clearTimeout(this.flush_timer);
    this.flush_timer = setTimeout(() => {
      this.flush_timer = null;
      // Background persistence participates in the same FIFO as server-bound
      // tools and commands. It must not overtake, or be overtaken by, a fresh
      // operation against the same workspace.
      void this.runExclusive(() => this.flush()).catch(() => {
        // `runFlush` already logged and re-queued the failed path. The timer is
        // best-effort; explicit readers/commands receive the rejection.
      });
    }, this.flush_debounce_ms);
  }

  /**
   * Force any pending debounced writes to the backend NOW and await them.
   * Establishes a happens-before edge for a reader that bypasses this fs and
   * goes straight to the backing store — notably a shell command (`run_command`)
   * that reads the workspace from disk and must see the files the agent just
   * wrote, which would otherwise still be sitting in the debounce window.
   * Idempotent and a no-op when nothing is dirty.
   */
  async flush(): Promise<void> {
    if (!(await this.flushPending())) {
      throw new Error("One or more agent filesystem writes failed to persist.");
    }
  }

  /**
   * Cancel the debounce timer, join any backend write already in flight, then
   * drain the paths queued after it. The boolean is false only when this batch
   * still could not be persisted (the path is re-queued for a later retry).
   */
  private async flushPending(): Promise<boolean> {
    if (this.flush_timer) {
      clearTimeout(this.flush_timer);
      this.flush_timer = null;
    }
    const result = this.flush_tail.then(
      () => this.runFlush(),
      () => this.runFlush()
    );
    this.flush_tail = result;
    return result;
  }

  private async runFlush(): Promise<boolean> {
    let persisted = true;
    const targets = [...this.flush_queue];
    this.flush_queue.clear();
    for (const path of targets) {
      if (this.disposed) return persisted;
      const entry = this.lookup(path);
      if (entry === null) continue;
      if (this.last_flushed.get(path) === entry.content) continue;
      try {
        await this.backend.write(path, entry.content);
        if (!this.disposed) this.last_flushed.set(path, entry.content);
      } catch (err) {
        persisted = false;
        console.warn(`[agent-fs] backend.write(${path}) failed:`, err);
        // Re-queue on transient failure so eventual persistence still
        // holds; otherwise a single failed flush would silently drop
        // the path until its content changes again.
        if (!this.disposed) this.queueFlush(path);
      }
    }
    return persisted;
  }
}

function parseError(err: unknown): AgentFs.WriteFailure {
  return {
    ok: false,
    reason: "parse_error",
    message:
      err instanceof Error
        ? `Failed to parse content: ${err.message}`
        : "Failed to parse content.",
  };
}

// ---------------------------------------------------------------------------
// AgentFs — the namespace.
//
// Everything below is the public type + tool surface. Consumers access
// these as `AgentFs.LiveBinding`, `AgentFs.tools`, `AgentFs.MemoryBackend`,
// etc.
// ---------------------------------------------------------------------------

export namespace AgentFs {
  /** Shared UTF-8 bound for model-readable and model-mutable text files. */
  export const MAX_TEXT_FILE_BYTES = MODEL_TEXT_FILE_MAX_BYTES;

  /** Backend signal for an existing text file outside the shared bound. */
  export class TextFileTooLargeError extends Error {
    readonly name = "TextFileTooLargeError";

    constructor(
      readonly path: string,
      readonly byte_length: number
    ) {
      super(
        `File at ${path} is ${byte_length} UTF-8 bytes; the text file limit is ${MAX_TEXT_FILE_BYTES} bytes.`
      );
    }
  }

  // -------------------------------------------------------------------------
  // Bindings & backend contracts
  // -------------------------------------------------------------------------

  /**
   * A `LiveBinding` connects an `AgentFs` path to a live, externally-managed
   * piece of state — e.g. a Grida SVG editor, a Monaco model, a Yjs doc.
   *
   * The fs is content-agnostic: it never inspects what `serialize()` returns
   * or what `load()` accepts. That's the binding's contract.
   *
   * **Version is monotonic and host-owned.** `getVersion()` must change
   * (typically increment) on every host-visible mutation — AI write, human
   * gesture, undo, external sync. Direct host callers may use it as the
   * `expected_version` for a whole-file write. Model-facing tools do not see
   * or return it.
   *
   * **`subscribe` is optional** but recommended for live-bound paths. Without
   * it, the fs only knows about its own writes — it can't auto-flush changes
   * made by the human (e.g. dragging a shape) to the backend.
   */
  export interface LiveBinding {
    /** Snapshot the current content as a string. Called by `read()`. */
    serialize(): string;

    /**
     * Apply `content` to the live state. May throw if `content` is
     * malformed; the fs surfaces those throws as `parse_error`.
     */
    load(content: string): void;

    /**
     * Monotonic host revision. Must reflect every host-visible change
     * (not just writes through the fs). Direct callers use it for conditional
     * full-file writes; model-facing edits use current-content matching.
     */
    getVersion(): number;

    /**
     * Subscribe to version-changing events. Returns an unsubscribe fn.
     * Optional — when absent, the fs only knows about its own writes.
     */
    subscribe?(cb: () => void): () => void;
  }

  /**
   * Persistence backend contract for `AgentFs`.
   *
   * The backend is a flat key-value store keyed by **absolute file path**
   * (e.g. `/canvas.svg`, `/notes/draft.md`). Paths begin with `/` and use
   * `/` as separator regardless of host OS — backends translate to their
   * native layout (subdirectories on disk, directory handles on OPFS, …).
   *
   * Backends are pure I/O — no caching or debouncing. A real filesystem MAY
   * expose the paired opaque-revision methods so an edit can detect competing
   * writes near publication time.
   *
   * Errors should be **thrown**, not swallowed. The fs handles them
   * (typically by logging + falling back to in-memory state).
   */
  export interface Backend {
    /** Enumerate every persisted path. Order undefined. */
    list(): Promise<string[]>;

    /**
     * List direct child folders/files under `path`, if the backend can do
     * scoped directory reads without hydrating the whole tree. `path` is already
     * normalized in the agent filesystem's path space.
     */
    list_directory?(path: string): Promise<ListEntries>;

    /**
     * Search backend-owned paths that are intentionally absent from
     * {@link list}, such as lazy read-only directory references. The backend
     * owns traversal bounds and returns the exact virtual paths it inspected so
     * the fs can merge counts without double-counting cached files.
     */
    grep?(args: GrepArgs): Promise<BackendGrepResult>;

    /** Read the bytes at `path`, or `null` if no such file. */
    read(path: string): Promise<string | null>;

    /**
     * Read current text plus an opaque backend revision. Paired with
     * {@link writeIfRevision}; implementations MUST provide both methods or
     * neither.
     */
    readWithRevision?(
      path: string
    ): Promise<BackendReadWithRevisionResult | null>;

    /**
     * Read the RAW bytes at `path` (no text decode), or `null` if no such
     * file. Optional: a backend that has no byte view (or stores only text)
     * MAY omit it, in which case byte-level consumers (e.g. `view_image`,
     * see `../vision`) treat the path as unreadable. Distinct from `read`,
     * which decodes UTF-8 — an image must never round-trip through a string.
     */
    readBytes?(path: string): Promise<Uint8Array | null>;

    /**
     * Write `content` to `path`, overwriting any prior content. Backends
     * must create any required parent directories.
     */
    write(path: string, content: string): Promise<void>;

    /**
     * Attempt an optimistic publish against `revision`. A stale result means a
     * competing change was detected and the backend MUST leave the file
     * unchanged. Success does not imply a cross-process lock unless the backend
     * itself provides one.
     */
    writeIfRevision?(
      path: string,
      content: string,
      revision: string
    ): Promise<BackendWriteIfRevisionResult>;

    /** Remove the file at `path`. No-op when the file doesn't exist. */
    delete(path: string): Promise<void>;
  }

  export type BackendReadWithRevisionResult = {
    content: string;
    revision: string;
  };

  export type BackendWriteIfRevisionResult =
    | { ok: true; revision: string }
    | { ok: false; reason: "stale" };

  // -------------------------------------------------------------------------
  // Mutation events
  // -------------------------------------------------------------------------

  /**
   * Mutation notification surface. Emitted by `AgentFs` whenever a path's
   * observable content changes — agent writes, edits, deletes, and writes
   * routed through a `LiveBinding`.
   *
   * Shape is intentionally minimal and maps cleanly onto Node's `fs.watch`
   * /ZenFS' `fs.watch` callback (`(eventType, filename) => ...`): when this
   * ever moves to a real VFS layer, consumers can keep their listener
   * signature and only swap the registration call.
   *
   * Not emitted for `mount` / `unmount` / `hydrate` — those are control-plane
   * operations the host already coordinates. Listeners only see content
   * mutations.
   */
  export type Event =
    | { type: "write"; path: string; version: number }
    | { type: "delete"; path: string };

  export type Listener = (event: Event) => void;

  // -------------------------------------------------------------------------
  // Constructor options
  // -------------------------------------------------------------------------

  export type Options = {
    /**
     * Debounce window for backend flushes triggered by host-visible changes
     * (binding emits, pure-file writes). Each change reschedules; the timer
     * fires when the writer goes idle. Default 500 ms.
     */
    flush_debounce_ms?: number;
    /**
     * GRIDA-SEC-004 — no-clobber guard (`fs/scope.ts` `isProtectedWrite`).
     * When provided, `write`/`edit` to a path it rejects fail with
     * `reason: "protected"`. Injected only on the workspace-bound agent path;
     * omitted on the standalone/client-resolved fs, which keeps its behavior.
     */
    write_guard?: (
      path: string
    ) => boolean | { reason: "protected" | "read_only"; message: string };
  };

  // -------------------------------------------------------------------------
  // Failure-reason vocabularies
  //
  // Single source of truth for each rejection-reason set. The TS union
  // type and the zod enum in the AI-SDK tool schema below are both
  // derived from these tuples, so they can't drift.
  // -------------------------------------------------------------------------

  export const READ_FAILURE_REASONS = [
    "not_found",
    "too_large",
    "io_error",
  ] as const;
  export type ReadFailureReason = (typeof READ_FAILURE_REASONS)[number];

  export const WRITE_FAILURE_REASONS = [
    "stale",
    "parse_error",
    "not_found",
    "too_large",
    "io_error",
    // GRIDA-SEC-004 — no-clobber path (see `fs/scope.ts`); only emitted when a
    // host injects a `write_guard` (the workspace-bound agent path).
    "protected",
    // A host-mounted resource whose bytes are readable but whose authority does
    // not include mutation (for example a dropped directory reference).
    "read_only",
  ] as const;
  export type WriteFailureReason = (typeof WRITE_FAILURE_REASONS)[number];

  export const EDIT_FAILURE_REASONS = [
    "stale",
    "not_found",
    "ambiguous",
    "parse_error",
    "no_op",
    "too_large",
    "io_error",
    // GRIDA-SEC-004 — no-clobber path (see `fs/scope.ts`).
    "protected",
    "read_only",
  ] as const;
  export type EditFailureReason = (typeof EDIT_FAILURE_REASONS)[number];

  export const DELETE_FAILURE_REASONS = ["not_found", "mounted"] as const;
  export type DeleteFailureReason = (typeof DELETE_FAILURE_REASONS)[number];

  // -------------------------------------------------------------------------
  // Result types (exported so callers can pattern-match without re-deriving)
  // -------------------------------------------------------------------------

  export type ReadResult = {
    content: string;
    version: number;
  };

  export type WriteArgs = {
    content: string;
    /**
     * - Pass a number → must match the file's current version. Mismatch
     *   → `stale`. Missing file → `not_found`.
     * - Pass `null` → permissive write. Creates the file if missing,
     *   overwrites otherwise; no freshness check.
     */
    expected_version: number | null;
  };

  export type WriteSuccess = { ok: true; version: number };
  export type WriteFailure = {
    ok: false;
    reason: WriteFailureReason;
    message: string;
    current_version?: number;
  };
  export type WriteResult = WriteSuccess | WriteFailure;

  export type EditArgs = {
    old_string: string;
    new_string: string;
    replace_all?: boolean;
  };

  export type EditOptions = {
    /**
     * Optional host/model-surface text bound. The generic filesystem leaves
     * this unset so document stores can persist larger files.
     */
    max_bytes?: number;
  };

  export type EditSuccess = {
    ok: true;
    version: number;
    occurrences: number;
  };
  export type EditFailure = {
    ok: false;
    reason: EditFailureReason;
    message: string;
    current_version?: number;
    /** Populated for `ambiguous` (how many matches). */
    occurrences?: number;
  };
  export type EditResult = EditSuccess | EditFailure;

  export type DeleteResult =
    | { ok: true }
    | { ok: false; reason: DeleteFailureReason; message: string };

  export type ListArgs = {
    /**
     * Directory path rooted in the agent filesystem. Defaults to `/`. Relative
     * inputs are tolerated by resolving them from `/`.
     */
    path?: string;
    /** Zero-based offset over the sorted direct-child entry list. */
    offset?: number;
    /** Page size, host-capped. Defaults to 200, max 1000. */
    limit?: number;
  };

  export type ListResult = {
    /** Normalized directory path that was listed. */
    path: string;
    /** Sorted absolute paths of direct child folders in this page. */
    folders: string[];
    /** Sorted absolute paths of direct child files in this page. */
    files: string[];
    /** True when more direct children remain after this page. */
    truncated: boolean;
    /** Pass as `offset` to fetch the next page. Present only when truncated. */
    next_offset?: number;
  };

  export type ListEntries = DirectoryEntries;

  export type GrepArgs = {
    /** Literal substring to match. Empty pattern → empty result. */
    pattern: string;
    /** Limit to paths starting with this prefix (e.g. `/notes/`). */
    path_prefix?: string;
    /** Default true. Set false for case-insensitive match. */
    case_sensitive?: boolean;
  };

  export type GrepMatch = {
    path: string;
    /** 1-indexed line number, mirroring `grep -n`. */
    line: number;
    /** The full line text. */
    text: string;
  };

  export type GrepResult = {
    matches: ReadonlyArray<GrepMatch>;
    /** Number of files scanned (mounts + pure files matching the prefix). */
    files_scanned: number;
  };

  /** Backend search result used to merge lazy and hydrated path spaces. */
  export type BackendGrepResult = {
    matches: ReadonlyArray<GrepMatch>;
    paths_scanned: ReadonlyArray<string>;
  };

  // -------------------------------------------------------------------------
  // AI-SDK tool table
  //
  // The canonical, path-aware tools. Hosts (e.g. the SVG demo) pass
  // `AgentFs.tools` to a `ToolLoopAgent` directly and dispatch incoming
  // calls via `chat.onToolCall` into an `AgentFs` instance using
  // `AgentFs.resolveToolCall`.
  //
  // Tools have **no `execute()`** — they're client-resolved against a
  // live `AgentFs`.
  // -------------------------------------------------------------------------

  export const TOOL_NAMES = {
    read_file: "read_file",
    edit_file: "edit_file",
    write_file: "write_file",
    list_files: "list_files",
    grep_files: "grep_files",
  } as const;

  export type ToolName = (typeof TOOL_NAMES)[keyof typeof TOOL_NAMES];

  export const tools = {
    [TOOL_NAMES.read_file]: tool({
      description:
        "Read a file's current text content. Use this to understand an " +
        "existing file or obtain exact context for edit_file. You do not " +
        "need to re-read content you just successfully wrote. Text files are " +
        `limited to ${MAX_TEXT_FILE_BYTES} UTF-8 bytes.`,
      inputSchema: z.object({
        path: z.string().describe(PATH_DESCRIPTION),
      }),
      outputSchema: z.union([
        z.object({
          content: z.string(),
        }),
        z.object({
          ok: z.literal(false),
          reason: z.enum(READ_FAILURE_REASONS),
          message: z.string(),
        }),
      ]),
    }),

    [TOOL_NAMES.edit_file]: tool({
      description:
        "Match-and-replace edit on a file. Find `old_string` and replace " +
        "with `new_string`. The default write path — cheap, safe, must " +
        "locate the change.\n\n" +
        "Matching: literal substring first, then whitespace-normalized " +
        "fallback (forgives doubled spaces / minor newline drift; not a " +
        "semantic fuzzy match). Must be unique unless `replace_all` is " +
        "true.\n\n" +
        "The tool reads the file's current content during this invocation " +
        "and applies the edit only when `old_string` matches that content. " +
        "A prior read_file is useful for obtaining context, but is not " +
        "authorization. Content you just wrote is valid context. Text files " +
        `are limited to ${MAX_TEXT_FILE_BYTES} UTF-8 bytes.`,
      inputSchema: z.object({
        path: z.string().describe(PATH_DESCRIPTION),
        old_string: z
          .string()
          .min(1)
          .describe(
            "Exact snippet expected in the file's current content. It may " +
              "come from read_file or content you just wrote. Include enough surrounding context to be unique."
          ),
        new_string: z
          .string()
          .describe(
            "Replacement text. May be empty to delete the matched range."
          ),
        replace_all: z
          .boolean()
          .optional()
          .describe(
            "Default false. When false, ambiguous matches reject with " +
              "reason='ambiguous' so you can disambiguate."
          ),
      }),
      outputSchema: z.discriminatedUnion("ok", [
        z.object({
          ok: z.literal(true),
          occurrences: z.number().int(),
        }),
        z.object({
          ok: z.literal(false),
          reason: z.enum(EDIT_FAILURE_REASONS),
          message: z.string(),
          occurrences: z.number().int().optional(),
        }),
      ]),
    }),

    [TOOL_NAMES.list_files]: tool({
      description:
        "List direct child folders and files under a directory in the agent " +
        "filesystem. Defaults to `/`. This is scoped directory discovery, " +
        "not a recursive whole-workspace inventory; use grep_files for " +
        "content search.",
      inputSchema: z.object({
        path: z
          .string()
          .optional()
          .describe(
            "Directory path rooted in the agent filesystem. Examples: `/`, `/notes`, `/public/slides-templates`. Omit for `/`."
          ),
        offset: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe("Zero-based pagination offset. Omit for the first page."),
        limit: z
          .number()
          .int()
          .positive()
          .max(LIST_DIRECTORY_MAX_LIMIT)
          .optional()
          .describe(
            `Maximum direct-child entries to return. Defaults to ${LIST_DIRECTORY_DEFAULT_LIMIT}.`
          ),
      }),
      outputSchema: z.object({
        path: z.string().describe("Normalized directory path that was listed."),
        folders: z
          .array(z.string())
          .describe("Sorted absolute paths of direct child folders."),
        files: z
          .array(z.string())
          .describe("Sorted absolute paths of direct child files."),
        truncated: z
          .boolean()
          .describe("True when more direct children remain after this page."),
        next_offset: z
          .number()
          .int()
          .optional()
          .describe("Pass as offset to fetch the next page."),
      }),
    }),

    [TOOL_NAMES.grep_files]: tool({
      description:
        "Literal substring search across every known file. Mirrors `grep -n -F`: " +
        "returns one entry per matching line with a 1-indexed line number and " +
        "the full line text.\n\n" +
        "Use this to find references / occurrences before deciding what to " +
        "edit. A matching line may not contain enough surrounding context " +
        "for a unique edit_file call; read the file when you need more.",
      inputSchema: z.object({
        pattern: z
          .string()
          .min(1)
          .describe(
            "Literal substring to match. Not a regex (v1). Case-sensitive by default."
          ),
        path_prefix: z
          .string()
          .optional()
          .describe(
            "Limit to paths starting with this prefix (e.g. `/notes/`). Omit to scan everything."
          ),
        case_sensitive: z
          .boolean()
          .optional()
          .describe(
            "Default true. Pass false for case-insensitive match (mirrors `grep -i`)."
          ),
      }),
      outputSchema: z.object({
        matches: z.array(
          z.object({
            path: z.string(),
            line: z.number().int().describe("1-indexed line number."),
            text: z.string().describe("Full line text."),
          })
        ),
        files_scanned: z.number().int(),
      }),
    }),

    [TOOL_NAMES.write_file]: tool({
      description:
        "Full-file upsert. Replace the entire content of `path` with " +
        "`content`. For surgical changes, prefer edit_file — it's safer " +
        "(must locate the change) and cheaper (smaller payload). This is an " +
        "intentional last-writer-wins operation: it creates a missing file " +
        "and overwrites an existing one. Content is limited to " +
        `${MAX_TEXT_FILE_BYTES} UTF-8 bytes so every successful write remains readable and editable.`,
      inputSchema: z.object({
        path: z.string().describe(PATH_DESCRIPTION),
        content: z.string().describe("Complete new content for the file."),
      }),
      outputSchema: z.discriminatedUnion("ok", [
        z.object({
          ok: z.literal(true),
        }),
        z.object({
          ok: z.literal(false),
          reason: z.enum(WRITE_FAILURE_REASONS),
          message: z.string(),
        }),
      ]),
    }),
  } as const;

  export type Tools = typeof tools;

  // -------------------------------------------------------------------------
  // Tool-call dispatcher
  //
  // Hosts hand `AgentFs.resolveToolCall` to `Chat`'s `onToolCall`:
  //
  //   const chat = new Chat({
  //     transport: ...,
  //     sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  //     onToolCall: ({ toolCall }) => {
  //       const output = AgentFs.resolveToolCall(fs, toolCall);
  //       if (output === undefined) return; // not one of ours
  //       chat.addToolResult({
  //         tool: toolCall.toolName,
  //         toolCallId: toolCall.toolCallId,
  //         output,
  //       });
  //     },
  //   });
  //
  // Returns `undefined` when the tool name isn't one of our five, so the
  // host can chain its own resolvers.
  // -------------------------------------------------------------------------

  type ReadFileInput = { path: string };
  type EditFileInput = {
    path: string;
    old_string: string;
    new_string: string;
    replace_all?: boolean;
  };
  type WriteFileInput = { path: string; content: string };
  type ListFilesInput = {
    path?: string;
    offset?: number;
    limit?: number;
  };
  type GrepFilesInput = {
    pattern: string;
    path_prefix?: string;
    case_sensitive?: boolean;
  };

  function modelReadResult(
    result: ReadResult,
    path: string
  ): { content: string } | { ok: false; reason: "too_large"; message: string } {
    const bytes = utf8ByteLength(result.content);
    if (bytes > MAX_TEXT_FILE_BYTES) {
      return {
        ok: false,
        reason: "too_large",
        message: new TextFileTooLargeError(path, bytes).message,
      };
    }
    return { content: result.content };
  }

  function modelEditResult(result: EditResult):
    | { ok: true; occurrences: number }
    | {
        ok: false;
        reason: EditFailureReason;
        message: string;
        occurrences?: number;
      } {
    if (result.ok) {
      return { ok: true, occurrences: result.occurrences };
    }
    return {
      ok: false,
      reason: result.reason,
      message: result.message,
      ...(result.occurrences === undefined
        ? {}
        : { occurrences: result.occurrences }),
    };
  }

  function modelWriteResult(
    result: WriteResult
  ): { ok: true } | { ok: false; reason: WriteFailureReason; message: string } {
    if (result.ok) return { ok: true };
    return {
      ok: false,
      reason: result.reason,
      message: result.message,
    };
  }

  export function resolveToolCall(
    fs: AgentFs,
    toolCall: { tool_name: string; input: unknown; dynamic?: boolean }
  ): unknown {
    if (toolCall.dynamic) return undefined;
    switch (toolCall.tool_name) {
      case TOOL_NAMES.read_file: {
        const { path } = toolCall.input as ReadFileInput;
        const r = fs.read(path);
        if (r === null) {
          return {
            ok: false,
            reason: "not_found",
            message: `No file at ${path}.`,
          };
        }
        return modelReadResult(r, path);
      }
      case TOOL_NAMES.list_files: {
        const { path, offset, limit } = (toolCall.input ??
          {}) as ListFilesInput;
        return fs.list_directory({ path, offset, limit });
      }
      case TOOL_NAMES.grep_files: {
        const { pattern, path_prefix, case_sensitive } =
          toolCall.input as GrepFilesInput;
        return fs.grep({ pattern, path_prefix, case_sensitive });
      }
      case TOOL_NAMES.edit_file: {
        const { path, old_string, new_string, replace_all } =
          toolCall.input as EditFileInput;
        return modelEditResult(
          fs.edit(
            path,
            {
              old_string,
              new_string,
              replace_all,
            },
            {
              max_bytes: MAX_TEXT_FILE_BYTES,
            }
          )
        );
      }
      case TOOL_NAMES.write_file: {
        const { path, content } = toolCall.input as WriteFileInput;
        const oversized = textSizeFailure(path, content, MAX_TEXT_FILE_BYTES);
        if (oversized) return oversized;
        return modelWriteResult(
          fs.write(path, { content, expected_version: null })
        );
      }
      default:
        return undefined;
    }
  }

  export async function resolveToolCallAsync(
    fs: AgentFs,
    toolCall: { tool_name: string; input: unknown; dynamic?: boolean }
  ): Promise<unknown> {
    if (toolCall.dynamic) return undefined;
    switch (toolCall.tool_name) {
      case TOOL_NAMES.read_file: {
        const { path } = toolCall.input as ReadFileInput;
        try {
          const result = await fs.read_fresh(path);
          return (
            (result ? modelReadResult(result, path) : null) ?? {
              ok: false,
              reason: "not_found",
              message: `No file at ${path}.`,
            }
          );
        } catch (err) {
          if (err instanceof TextFileTooLargeError) {
            return {
              ok: false,
              reason: "too_large",
              message: err.message,
            };
          }
          return {
            ok: false,
            reason: "io_error",
            message: `The backing store rejected the read of ${path}; this does not mean the file is missing.`,
          };
        }
      }
      case TOOL_NAMES.list_files: {
        const { path, offset, limit } = (toolCall.input ??
          {}) as ListFilesInput;
        return await fs.list_directory_fresh({ path, offset, limit });
      }
      case TOOL_NAMES.grep_files: {
        const { pattern, path_prefix, case_sensitive } =
          toolCall.input as GrepFilesInput;
        return await fs.grep_fresh({
          pattern,
          path_prefix,
          case_sensitive,
        });
      }
      case TOOL_NAMES.edit_file: {
        const { path, old_string, new_string, replace_all } =
          toolCall.input as EditFileInput;
        return modelEditResult(
          await fs.edit_fresh(
            path,
            {
              old_string,
              new_string,
              replace_all,
            },
            {
              max_bytes: MAX_TEXT_FILE_BYTES,
            }
          )
        );
      }
      case TOOL_NAMES.write_file: {
        const { path, content } = toolCall.input as WriteFileInput;
        const oversized = textSizeFailure(path, content, MAX_TEXT_FILE_BYTES);
        if (oversized) return oversized;
        return modelWriteResult(
          await fs.write_fresh(path, {
            content,
            expected_version: null,
          })
        );
      }
      default:
        return resolveToolCall(fs, toolCall);
    }
  }

  // -------------------------------------------------------------------------
  // Default in-process backend.
  //
  // OPFS / Node backends live behind their own subpath imports so a bare
  // `import "@grida/agent/fs"` doesn't pull `navigator.storage` or
  // `node:fs`.
  // -------------------------------------------------------------------------

  /**
   * Ephemeral in-process backend. Survives only for the lifetime of the
   * `MemoryBackend` instance. Default for tests and SSR.
   */
  export class MemoryBackend implements Backend {
    private files = new Map<string, string>();

    async list(): Promise<string[]> {
      return [...this.files.keys()];
    }

    async read(path: string): Promise<string | null> {
      return this.files.has(path) ? (this.files.get(path) as string) : null;
    }

    async readBytes(path: string): Promise<Uint8Array | null> {
      // Memory holds text only — hand back its UTF-8 bytes. Useful for
      // text-shaped sources (svg, code); a true bitmap belongs on a disk
      // backend (NodeFs/OPFS), not here. `TextEncoder` is universal (Node +
      // browser); reached via globalThis so the neutral build needs no lib dom.
      const s = this.files.get(path);
      if (s === undefined) return null;
      const TE = (
        globalThis as {
          TextEncoder?: new () => { encode(s: string): Uint8Array };
        }
      ).TextEncoder;
      return TE
        ? new TE().encode(s)
        : Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);
    }

    async write(path: string, content: string): Promise<void> {
      this.files.set(path, content);
    }

    async delete(path: string): Promise<void> {
      this.files.delete(path);
    }
  }
}
