import { nanoid } from "nanoid";
import { AgentFs } from "@grida/agent-tools/fs";
import { OpfsBackend } from "@grida/agent-tools/fs/backends/opfs";
import type { SvgEditor } from "@grida/svg-editor";
import { svgEditorBinding } from "../_ai/binding-svg";
import { svgToDataUri } from "./thumbnails";

export type SvgDocSummary = {
  id: string;
  name: string;
  thumbnailDataUri: string;
};

export type SvgDocStoreOptions = {
  /** e.g. `["grida-svg-demo", "v2", "default"]`. */
  opfsBase: readonly string[];
  /** Initial SVG used when the store is empty on first hydrate. */
  defaultSvg: string;
  /** Debounced thumbnail refresh window for active-doc edits. Default 250 ms. */
  commitDebounceMs?: number;
};

type SidecarEntry = { id: string; name: string; createdAt: number };
type SidecarState = {
  version: 1;
  docs: SidecarEntry[];
  activeId: string | null;
};

const SIDECAR_PATH = "/index.json";

function pickBackend(opfsBase: readonly string[]): AgentFs.Backend {
  if (OpfsBackend.isSupported()) return new OpfsBackend(opfsBase);
  return new AgentFs.MemoryBackend();
}

function pathOf(id: string): string {
  return `/${id}.svg`;
}

function idFromPath(path: string): string | null {
  const m = path.match(/^\/([^/]+)\.svg$/);
  return m ? m[1] : null;
}

/**
 * Owns the multi-document state for one SVG demo route. Composes:
 *
 *  - **Canvas `AgentFs`** — every doc persists as `/<id>.svg`. Hot-swaps
 *    a `LiveBinding` to the currently-active editor on `attachEditor` /
 *    `setActiveId`. This is the fs the AI agent operates on.
 *  - **Meta `AgentFs`** — a sibling AgentFs over a `_meta` scope holding
 *    a single `/index.json` (doc order + names + activeId). Kept separate
 *    so the agent's `list_files` never sees this metadata. Reuses AgentFs's
 *    debounced flush + dedup.
 */
export class SvgDocStore {
  private readonly fs: AgentFs;
  private readonly canvasBackend: AgentFs.Backend;
  private readonly metaFs: AgentFs;
  private readonly defaultSvg: string;
  private readonly commitDebounceMs: number;

  private docs: SvgDocSummary[] = [];
  private activeId: string | null = null;
  private hydrated = false;
  private hydrate_promise: Promise<void> | null = null;
  private disposed = false;

  /** id → last-serialized SVG. Source for thumbnails + `initialSvg`. */
  private readonly content = new Map<string, string>();
  /** id → createdAt epoch ms. Set once on creation; preserved on hydrate. */
  private readonly createdAt = new Map<string, number>();

  private editor: SvgEditor | null = null;
  private editor_unsub: (() => void) | null = null;
  private fs_unwatch: (() => void) | null = null;
  private commit_timer: ReturnType<typeof setTimeout> | null = null;
  /** Editor version at the last successful `persistActive`. Guards against
   *  re-serializing on emits that didn't change document state (camera, hover). */
  private last_persisted_version = -1;

  private readonly listeners = new Set<() => void>();

  constructor(opts: SvgDocStoreOptions) {
    this.canvasBackend = pickBackend(opts.opfsBase);
    this.fs = new AgentFs(this.canvasBackend);
    this.metaFs = new AgentFs(pickBackend([...opts.opfsBase, "_meta"]));
    this.defaultSvg = opts.defaultSvg;
    this.commitDebounceMs = opts.commitDebounceMs ?? 250;
    // Reflect agent-driven fs mutations into the doc list. Events for the
    // active doc are short-circuited (the binding chain already updates
    // the editor); echoes from our own writes are filtered by content
    // equality inside the handler.
    this.fs_unwatch = this.fs.watch((event) => this.onCanvasFsEvent(event));
  }

  // ──────────────────────────────────────────────────────────────────
  // Lifecycle
  // ──────────────────────────────────────────────────────────────────

  hydrate(): Promise<void> {
    if (this.hydrate_promise) return this.hydrate_promise;
    this.hydrate_promise = this.runHydrate();
    return this.hydrate_promise;
  }

  private async runHydrate(): Promise<void> {
    await Promise.all([this.fs.hydrate(), this.metaFs.hydrate()]);
    if (this.disposed) return;

    for (const path of this.fs.list()) {
      const id = idFromPath(path);
      if (id == null) continue;
      const r = this.fs.read(path);
      if (r) this.content.set(id, r.content);
    }

    const persisted = this.readSidecar();
    if (persisted && persisted.docs.length > 0) {
      const survivors = persisted.docs.filter((d) => this.content.has(d.id));
      if (survivors.length > 0) {
        for (const d of survivors) this.createdAt.set(d.id, d.createdAt);
        this.docs = survivors.map((d) => this.summarize(d.id, d.name));
        this.activeId =
          persisted.activeId &&
          survivors.some((d) => d.id === persisted.activeId)
            ? persisted.activeId
            : survivors[0].id;
      }
    }

    if (this.docs.length === 0 && this.content.size > 0) {
      let n = 1;
      const now = Date.now();
      for (const [id] of this.content) {
        this.createdAt.set(id, now);
        this.docs.push(this.summarize(id, `Document ${n++}`));
      }
      this.activeId = this.docs[0].id;
    }

    if (this.docs.length === 0) this.seedFirstDoc();

    this.hydrated = true;
    this.persistSidecar();
    this.notify();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.fs_unwatch) {
      this.fs_unwatch();
      this.fs_unwatch = null;
    }
    this.flushAndDetach();
    this.fs.dispose();
    this.metaFs.dispose();
    this.listeners.clear();
  }

  // ──────────────────────────────────────────────────────────────────
  // Pub/sub
  // ──────────────────────────────────────────────────────────────────

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private notify(): void {
    for (const l of this.listeners) l();
  }

  // ──────────────────────────────────────────────────────────────────
  // Snapshots
  // ──────────────────────────────────────────────────────────────────

  getDocs = (): readonly SvgDocSummary[] => this.docs;
  getActiveId = (): string | null => this.activeId;
  isHydrated = (): boolean => this.hydrated;
  getFs = (): AgentFs => this.fs;
  pathOf = (id: string): string => pathOf(id);

  getActiveSvg(): string {
    if (!this.activeId) return this.defaultSvg;
    return this.content.get(this.activeId) ?? this.defaultSvg;
  }

  // ──────────────────────────────────────────────────────────────────
  // Mutations
  // ──────────────────────────────────────────────────────────────────

  appendDoc(svg?: string, name?: string): string {
    this.persistActive();

    const id = nanoid();
    const content = svg ?? this.defaultSvg;
    const displayName = name ?? `Document ${this.docs.length + 1}`;

    this.createdAt.set(id, Date.now());
    this.content.set(id, content);
    this.fs.write(pathOf(id), { content, expected_version: null });
    this.docs = [...this.docs, this.summarize(id, displayName)];
    this.switchActive(id);
    this.persistSidecar();
    this.notify();
    return id;
  }

  removeDoc(id: string): void {
    if (this.docs.length <= 1) {
      throw new Error("cannot remove the last document");
    }
    const idx = this.docs.findIndex((d) => d.id === id);
    if (idx === -1) return;

    const wasActive = this.activeId === id;
    if (wasActive) this.detachEditorWithoutFlush();

    this.fs.unmount(pathOf(id));
    this.content.delete(id);
    this.createdAt.delete(id);
    void this.canvasBackend.delete(pathOf(id)).catch((err) => {
      console.warn(`[svg-doc-store] backend.delete failed:`, err);
    });

    this.docs = this.docs.filter((d) => d.id !== id);

    if (wasActive) {
      const nextIdx = Math.max(0, idx - 1);
      this.activeId = this.docs[nextIdx].id;
    }
    this.persistSidecar();
    this.notify();
  }

  renameDoc(id: string, name: string): void {
    let changed = false;
    this.docs = this.docs.map((d) => {
      if (d.id !== id || d.name === name) return d;
      changed = true;
      // Reuse the existing thumbnail — rename doesn't change pixels.
      return { ...d, name };
    });
    if (!changed) return;
    this.persistSidecar();
    this.notify();
  }

  // ──────────────────────────────────────────────────────────────────
  // External (agent) fs mutations
  // ──────────────────────────────────────────────────────────────────

  /**
   * Route `AgentFs.watch` events into doc-list mutations. The agent
   * operates on a virtual fs; the editor surface needs to mirror that.
   *
   * Filters applied here:
   *   - Paths that don't match `/{id}.svg` are scratch files; skip.
   *   - Active doc writes are handled by the binding chain (editor.load
   *     → editor.emit → queueCommitTick); skip to avoid double-update.
   *   - Writes whose content equals our cached bytes are echoes from our
   *     own `fs.write` calls (appendDoc, seedFirstDoc); skip.
   *   - Deletes for unknown ids are no-ops.
   */
  private onCanvasFsEvent(event: AgentFs.Event): void {
    if (this.disposed) return;
    const id = idFromPath(event.path);
    if (id == null) return;

    if (event.type === "delete") {
      if (!this.content.has(id)) return;
      this.handleExternalDelete(id);
      return;
    }

    if (id === this.activeId) return;

    const r = this.fs.read(event.path);
    if (!r) return;
    if (this.content.get(id) === r.content) return;

    if (this.docs.some((d) => d.id === id)) {
      this.handleExternalUpdate(id, r.content);
    } else {
      this.handleExternalCreate(id, r.content);
    }
  }

  /** Agent wrote to a brand-new path. Persist current editor first,
   *  append the new doc, and switch to it so the result is visible. */
  private handleExternalCreate(id: string, content: string): void {
    this.persistActive();
    this.createdAt.set(id, Date.now());
    this.content.set(id, content);
    this.docs = [...this.docs, this.summarize(id, id)];
    this.switchActive(id);
    this.persistSidecar();
    this.notify();
  }

  /** Agent overwrote an existing non-active doc. Refresh its content
   *  cache + thumbnail; do not switch active. */
  private handleExternalUpdate(id: string, content: string): void {
    this.content.set(id, content);
    this.docs = this.docs.map((d) =>
      d.id === id ? this.summarize(id, d.name) : d
    );
    this.notify();
  }

  /** Agent deleted a non-active doc. Strip it from the list. Active doc
   *  can't reach here — `AgentFs.delete` rejects mounted paths. */
  private handleExternalDelete(id: string): void {
    if (this.docs.length <= 1) return;
    this.content.delete(id);
    this.createdAt.delete(id);
    this.docs = this.docs.filter((d) => d.id !== id);
    this.persistSidecar();
    this.notify();
  }

  setActiveId(id: string): void {
    if (id === this.activeId) return;
    if (!this.docs.some((d) => d.id === id)) return;
    this.persistActive();
    this.switchActive(id);
    this.persistSidecar();
    this.notify();
  }

  /**
   * Drop every doc and seed a fresh one. Atomic from a subscriber's
   * perspective — one `notify()`, one sidecar write.
   */
  reset(svg?: string, name?: string): string {
    this.detachEditorWithoutFlush();

    for (const d of this.docs) {
      this.fs.unmount(pathOf(d.id));
      void this.canvasBackend.delete(pathOf(d.id)).catch((err) => {
        console.warn(`[svg-doc-store] backend.delete failed:`, err);
      });
    }
    this.docs = [];
    this.content.clear();
    this.createdAt.clear();
    this.activeId = null;

    const id = this.seedFirstDoc(svg, name);
    this.persistSidecar();
    this.notify();
    return id;
  }

  // ──────────────────────────────────────────────────────────────────
  // Editor binding
  // ──────────────────────────────────────────────────────────────────

  attachEditor(editor: SvgEditor): void {
    if (this.disposed) return;
    if (this.editor === editor) return;
    this.flushAndDetach();
    this.editor = editor;
    this.last_persisted_version = editor.state.version;
    if (this.activeId) {
      this.fs.mount(pathOf(this.activeId), svgEditorBinding(editor));
    }
    // Subscribes to the full channel (not subscribe_geometry) so
    // presentation-only edits — fill, opacity — also refresh the
    // thumbnail. `queueCommitTick` early-exits on unchanged version.
    this.editor_unsub = editor.subscribe(() => this.queueCommitTick());
  }

  detachEditor(): void {
    // Doc list identity doesn't change on detach; subscribers don't need
    // to re-render here. The next `attachEditor` (or a real mutation)
    // will fire its own notify.
    this.flushAndDetach();
  }

  // ──────────────────────────────────────────────────────────────────
  // Internals
  // ──────────────────────────────────────────────────────────────────

  private switchActive(id: string): void {
    this.flushAndDetach();
    this.activeId = id;
  }

  /** Final-flush bytes to OPFS, unmount, drop editor refs. */
  private flushAndDetach(): void {
    this.clearCommitTimer();
    if (this.editor && this.activeId) {
      const changed = this.persistActive();
      this.fs.unmount(pathOf(this.activeId));
      if (changed) {
        const svg = this.content.get(this.activeId);
        if (svg != null) {
          void this.canvasBackend
            .write(pathOf(this.activeId), svg)
            .catch((err) => {
              console.warn(`[svg-doc-store] backend.write failed:`, err);
            });
        }
      }
    }
    this.releaseEditor();
  }

  /** Detach without flushing — used by `removeDoc` where the OPFS file is
   *  about to be deleted, so a final write would race the delete. */
  private detachEditorWithoutFlush(): void {
    this.clearCommitTimer();
    if (this.editor && this.activeId) {
      this.fs.unmount(pathOf(this.activeId));
    }
    this.releaseEditor();
  }

  private releaseEditor(): void {
    if (this.editor_unsub) {
      this.editor_unsub();
      this.editor_unsub = null;
    }
    this.editor = null;
    this.last_persisted_version = -1;
  }

  private clearCommitTimer(): void {
    if (this.commit_timer) {
      clearTimeout(this.commit_timer);
      this.commit_timer = null;
    }
  }

  /** Snapshot the active editor into the content cache + summary. Returns
   *  `true` if bytes actually changed. Skips entirely when the editor's
   *  version hasn't moved since the last call. */
  private persistActive(): boolean {
    const editor = this.editor;
    const id = this.activeId;
    if (!editor || !id) return false;
    const version = editor.state.version;
    if (version === this.last_persisted_version) return false;
    this.last_persisted_version = version;
    const svg = editor.serialize();
    if (this.content.get(id) === svg) return false;
    this.content.set(id, svg);
    this.docs = this.docs.map((d) =>
      d.id === id ? this.summarize(id, d.name) : d
    );
    return true;
  }

  private queueCommitTick(): void {
    if (this.commit_timer) clearTimeout(this.commit_timer);
    this.commit_timer = setTimeout(() => {
      this.commit_timer = null;
      if (this.disposed) return;
      if (this.persistActive()) this.notify();
    }, this.commitDebounceMs);
  }

  private summarize(id: string, name: string): SvgDocSummary {
    const svg = this.content.get(id) ?? this.defaultSvg;
    return {
      id,
      name,
      thumbnailDataUri: svgToDataUri(svg),
    };
  }

  private seedFirstDoc(svg?: string, name?: string): string {
    const id = nanoid();
    const content = svg ?? this.defaultSvg;
    this.createdAt.set(id, Date.now());
    this.content.set(id, content);
    this.fs.write(pathOf(id), { content, expected_version: null });
    this.docs = [this.summarize(id, name ?? "Document 1")];
    this.activeId = id;
    return id;
  }

  private readSidecar(): SidecarState | null {
    const r = this.metaFs.read(SIDECAR_PATH);
    if (!r) return null;
    try {
      const parsed = JSON.parse(r.content) as SidecarState;
      if (parsed?.version !== 1 || !Array.isArray(parsed.docs)) return null;
      return parsed;
    } catch (err) {
      console.warn("[svg-doc-store] sidecar parse failed:", err);
      return null;
    }
  }

  private persistSidecar(): void {
    const state: SidecarState = {
      version: 1,
      docs: this.docs.map((d) => ({
        id: d.id,
        name: d.name,
        createdAt: this.createdAt.get(d.id) ?? Date.now(),
      })),
      activeId: this.activeId,
    };
    this.metaFs.write(SIDECAR_PATH, {
      content: JSON.stringify(state),
      expected_version: null,
    });
  }
}
