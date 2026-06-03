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

const PATH_DESCRIPTION =
  "Absolute path in the agent filesystem, starting with `/`. " +
  "Examples: `/canvas.svg`, `/notes/draft.md`.";

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
 *  - **Safety contract.** Read-before-write + version freshness checks
 *    on every mutating op, so the agent can't silently overwrite human
 *    edits or its own stale view.
 *
 * Two file shapes share the API:
 *
 *  - **Bound files.** `mount(path, binding)` ties a path to an
 *    `AgentFs.LiveBinding`. `read` and `write` go through the binding;
 *    `getVersion()` is the freshness token. The backend persists a
 *    serialized snapshot; on `hydrate()` we load it via `binding.load()`.
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
  /** Paths the agent has called `read()` on this session. */
  private readonly last_read = new Map<string, number>();
  /** Last content sent to the backend per path. Avoids redundant writes. */
  private readonly last_flushed = new Map<string, string>();
  private readonly flush_queue = new Set<string>();
  private flush_timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private hydrate_promise: Promise<void> | null = null;
  private readonly watchers = new Set<AgentFs.Listener>();

  constructor(
    private readonly backend: AgentFs.Backend,
    opts: AgentFs.Options = {}
  ) {
    this.flush_debounce_ms = opts.flush_debounce_ms ?? 500;
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
    this.last_read.delete(path);
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
    // Fan out reads; the apply-to-state step that follows must be
    // sequential (binding.load + Map mutations aren't reentrant).
    const reads = await Promise.allSettled(
      paths.map((p) => this.backend.read(p))
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

  exists(path: string): boolean {
    return this.bindings.has(path) || this.files.has(path);
  }

  /**
   * Read the content + current version. Returns `null` for unknown paths
   * (call `hydrate()` first if the file might only exist in the backend).
   */
  read(path: string): AgentFs.ReadResult | null {
    const binding = this.bindings.get(path);
    if (binding) {
      const version = binding.getVersion();
      this.last_read.set(path, version);
      return { content: binding.serialize(), version };
    }
    const entry = this.files.get(path);
    if (!entry) return null;
    this.last_read.set(path, entry.version);
    return { content: entry.content, version: entry.version };
  }

  /**
   * Full-content upsert. See {@link AgentFs.WriteArgs} for the
   * `expected_version` semantics (version-checked vs permissive).
   */
  write(path: string, args: AgentFs.WriteArgs): AgentFs.WriteResult {
    const { content, expected_version } = args;
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
   * Match-and-replace edit. Requires the file to exist and the agent to
   * have read it this session (`not_read` otherwise). Standard staleness
   * check via `expected_version`.
   *
   * Matching: literal first, then whitespace-normalized — see
   * `findMatches`. Ambiguous matches reject with `reason: "ambiguous"`
   * unless `replace_all` is set.
   */
  edit(path: string, args: AgentFs.EditArgs): AgentFs.EditResult {
    const { old_string, new_string, replace_all, expected_version } = args;

    const entry = this.lookup(path);
    if (entry === null) {
      return {
        ok: false,
        reason: "not_found",
        message: `No file at ${path}.`,
      };
    }
    if (!this.last_read.has(path)) {
      return {
        ok: false,
        reason: "not_read",
        message: `Call read_file(${path}) before editing.`,
      };
    }
    if (entry.version !== expected_version) {
      return {
        ok: false,
        reason: "stale",
        message: `File at ${path} changed since you last read it.`,
        current_version: entry.version,
      };
    }
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

    const ranges = findMatches(entry.content, old_string);
    if (ranges.length === 0) {
      return {
        ok: false,
        reason: "not_found",
        message: `\`old_string\` not found in ${path}. Re-read with read_file and copy the snippet verbatim.`,
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
    const next = applyReplacements(entry.content, ranges, new_string);

    const committed = this.commit(path, next);
    if (!committed.ok) return committed;
    return { ...committed, occurrences: ranges.length };
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
   * Side-effect-free: does NOT mark `last_read`, so a subsequent `edit_file`
   * still has to read the file first. Search is for finding things, not
   * for claiming you've read them.
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
    this.last_read.delete(path);
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
      this.last_read.set(path, v);
      this.queueFlush(path);
      this.emit({ type: "write", path, version: v });
      return { ok: true, version: v };
    }
    const existing = this.files.get(path);
    const next: FileEntry = {
      content,
      version: (existing?.version ?? 0) + 1,
    };
    this.files.set(path, next);
    this.last_read.set(path, next.version);
    this.queueFlush(path);
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
      void this.runFlush();
    }, this.flush_debounce_ms);
  }

  private async runFlush(): Promise<void> {
    const targets = [...this.flush_queue];
    this.flush_queue.clear();
    for (const path of targets) {
      if (this.disposed) return;
      const entry = this.lookup(path);
      if (entry === null) continue;
      if (this.last_flushed.get(path) === entry.content) continue;
      try {
        await this.backend.write(path, entry.content);
        if (!this.disposed) this.last_flushed.set(path, entry.content);
      } catch (err) {
        console.warn(`[agent-fs] backend.write(${path}) failed:`, err);
        // Re-queue on transient failure so eventual persistence still
        // holds; otherwise a single failed flush would silently drop
        // the path until its content changes again.
        if (!this.disposed) this.queueFlush(path);
      }
    }
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
   * gesture, undo, external sync. The fs uses it as a freshness token
   * (`expected_version` matches → safe to write; mismatch → stale).
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
     * Monotonic freshness token. Must reflect every host-visible change
     * (not just writes through the fs). The fs uses it to detect
     * concurrent edits between the agent's read and write.
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
   * Backends are pure I/O — no caching, no debouncing, no version
   * tracking. The fs layer owns those.
   *
   * Errors should be **thrown**, not swallowed. The fs handles them
   * (typically by logging + falling back to in-memory state).
   */
  export interface Backend {
    /** Enumerate every persisted path. Order undefined. */
    list(): Promise<string[]>;

    /** Read the bytes at `path`, or `null` if no such file. */
    read(path: string): Promise<string | null>;

    /**
     * Write `content` to `path`, overwriting any prior content. Backends
     * must create any required parent directories.
     */
    write(path: string, content: string): Promise<void>;

    /** Remove the file at `path`. No-op when the file doesn't exist. */
    delete(path: string): Promise<void>;
  }

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
  };

  // -------------------------------------------------------------------------
  // Failure-reason vocabularies
  //
  // Single source of truth for each rejection-reason set. The TS union
  // type and the zod enum in the AI-SDK tool schema below are both
  // derived from these tuples, so they can't drift.
  // -------------------------------------------------------------------------

  export const WRITE_FAILURE_REASONS = [
    "stale",
    "parse_error",
    "not_found",
  ] as const;
  export type WriteFailureReason = (typeof WRITE_FAILURE_REASONS)[number];

  export const EDIT_FAILURE_REASONS = [
    "not_read",
    "stale",
    "not_found",
    "ambiguous",
    "parse_error",
    "no_op",
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
    expected_version: number;
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
        "Read a file's content and version (a freshness token).\n\n" +
        "Always call this before your first edit_file on a given path, and " +
        "re-read whenever an edit / write returns reason='stale'.",
      inputSchema: z.object({
        path: z.string().describe(PATH_DESCRIPTION),
      }),
      outputSchema: z.union([
        z.object({
          content: z.string(),
          version: z.number().int(),
        }),
        z.object({
          ok: z.literal(false),
          reason: z.literal("not_found"),
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
        "Requires a prior read_file on this path. On reason='stale', the " +
        "human edited in the meantime — read_file again and retry.",
      inputSchema: z.object({
        path: z.string().describe(PATH_DESCRIPTION),
        old_string: z
          .string()
          .min(1)
          .describe(
            "Exact snippet from the read_file output. Include enough " +
              "surrounding context to be unique."
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
        version: z
          .number()
          .int()
          .describe("Version from the most recent read_file."),
      }),
      outputSchema: z.discriminatedUnion("ok", [
        z.object({
          ok: z.literal(true),
          version: z.number().int(),
          occurrences: z.number().int(),
        }),
        z.object({
          ok: z.literal(false),
          reason: z.enum(EDIT_FAILURE_REASONS),
          message: z.string(),
          current_version: z.number().int().optional(),
          occurrences: z.number().int().optional(),
        }),
      ]),
    }),

    [TOOL_NAMES.list_files]: tool({
      description:
        "Enumerate every known file in the agent filesystem. Returns " +
        "sorted absolute paths (e.g. `/canvas.svg`, `/notes/draft.md`).",
      inputSchema: z.object({}),
      outputSchema: z.object({
        files: z
          .array(z.string())
          .describe("Sorted absolute paths of every known file."),
      }),
    }),

    [TOOL_NAMES.grep_files]: tool({
      description:
        "Literal substring search across every known file. Mirrors `grep -n -F`: " +
        "returns one entry per matching line with a 1-indexed line number and " +
        "the full line text.\n\n" +
        "Use this to find references / occurrences before deciding what to " +
        "edit. Does NOT count as a `read_file` — you still have to read a " +
        "file before editing it.",
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
        "(must locate the change) and cheaper (smaller payload).\n\n" +
        "`version` is optional:\n" +
        "  • include it (from the most recent read_file) for an explicit " +
        "wholesale rewrite — same staleness safety as edit_file.\n" +
        "  • omit it for a permissive write (creates the file if missing; " +
        "overwrites without a freshness check). Only use when you don't " +
        "care what's currently there.",
      inputSchema: z.object({
        path: z.string().describe(PATH_DESCRIPTION),
        content: z.string().describe("Complete new content for the file."),
        version: z
          .number()
          .int()
          .optional()
          .describe(
            "Optional. When provided, the write fails with reason='stale' " +
              "unless the current version matches. Omit for permissive write."
          ),
      }),
      outputSchema: z.discriminatedUnion("ok", [
        z.object({
          ok: z.literal(true),
          version: z.number().int(),
        }),
        z.object({
          ok: z.literal(false),
          reason: z.enum(WRITE_FAILURE_REASONS),
          message: z.string(),
          current_version: z.number().int().optional(),
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
    version: number;
  };
  type WriteFileInput = { path: string; content: string; version?: number };
  type GrepFilesInput = {
    pattern: string;
    path_prefix?: string;
    case_sensitive?: boolean;
  };

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
        return r;
      }
      case TOOL_NAMES.list_files: {
        return { files: [...fs.list()].sort() };
      }
      case TOOL_NAMES.grep_files: {
        const { pattern, path_prefix, case_sensitive } =
          toolCall.input as GrepFilesInput;
        return fs.grep({ pattern, path_prefix, case_sensitive });
      }
      case TOOL_NAMES.edit_file: {
        const { path, old_string, new_string, replace_all, version } =
          toolCall.input as EditFileInput;
        return fs.edit(path, {
          old_string,
          new_string,
          replace_all,
          expected_version: version,
        });
      }
      case TOOL_NAMES.write_file: {
        const { path, content, version } = toolCall.input as WriteFileInput;
        return fs.write(path, { content, expected_version: version ?? null });
      }
      default:
        return undefined;
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

    async write(path: string, content: string): Promise<void> {
      this.files.set(path, content);
    }

    async delete(path: string): Promise<void> {
      this.files.delete(path);
    }
  }
}
