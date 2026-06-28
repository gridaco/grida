import { nanoid } from "nanoid";
import { AgentFs } from "@grida/agent/fs";
import { OpfsBackend } from "@grida/agent/fs/backends/opfs";
import { dotcanvas } from "dotcanvas";
import type { SvgEditor } from "@grida/svg-editor";
import { svgEditorBinding } from "../_ai/binding-svg";
import { bundleFs, ManifestHidingBackend } from "./bundle-fs";
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

/** The `.canvas` editor this demo writes — a linear deck of SVG slides. The
 *  SVG content kind is carried by the manifest's `files` (default `["*.svg"]`). */
const EDITOR: dotcanvas.EditorType = "slides";

/** App extension key under the manifest `ext` bag for demo view-state. */
const APP_EXT_KEY = "co.grida.svg-demo";

type AppExt = { activeId?: string };

/** `<id>.svg` → `<id>` (the store's document identity is the filename stem). */
function stemOf(src: string): string {
  return src.replace(/\.svg$/i, "");
}

function readAppExt(ext: Record<string, unknown>): AppExt {
  const v = ext[APP_EXT_KEY];
  return v && typeof v === "object" && !Array.isArray(v) ? (v as AppExt) : {};
}

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
 * Owns the multi-document state for one SVG demo route, persisted as a
 * portable `.canvas` bundle (a `.canvas.json` manifest + `<id>.svg` files)
 * via `dotcanvas`. Composes:
 *
 *  - **Bundle backend** — OPFS (or memory) holding `.canvas.json` + every
 *    `/<id>.svg`. The manifest (order + per-doc `name`/`createdAt` + the
 *    active id in `ext`) is read with `dotcanvas.read` and rewritten with
 *    `dotcanvas.write` on every mutation.
 *  - **Agent `AgentFs`** — built over `ManifestHidingBackend(bundle)` so the
 *    AI copilot sees only the `/<id>.svg` documents, never `.canvas.json`.
 *    Hot-swaps a `LiveBinding` to the active editor on `attachEditor` /
 *    `setActiveId`. This is the fs returned by `getFs()`.
 */
export class SvgDocStore {
  private readonly fs: AgentFs;
  private readonly canvasBackend: AgentFs.Backend;
  private readonly defaultSvg: string;
  private readonly commitDebounceMs: number;
  /** Serializes manifest writes so the latest snapshot is the last to land. */
  private manifestWriteChain: Promise<void> = Promise.resolve();

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
    // The agent fs is built over a manifest-hiding view: the copilot sees the
    // `/<id>.svg` documents but never `.canvas.json` (read/written separately).
    this.fs = new AgentFs(new ManifestHidingBackend(this.canvasBackend));
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
    await this.fs.hydrate();
    if (this.disposed) return;

    // Load every SVG document's bytes (the manifest is hidden from `this.fs`).
    for (const path of this.fs.list()) {
      const id = idFromPath(path);
      if (id == null) continue;
      const r = this.fs.read(path);
      if (r) this.content.set(id, r.content);
    }

    // Read the manifest. `dotcanvas.read` reconciles it against disk: it skips
    // documents whose file is missing, appends on-disk SVGs the manifest omits,
    // and derives the list from disk entirely when `.canvas.json` is absent.
    const resolved = await dotcanvas.read(bundleFs(this.canvasBackend));
    if (this.disposed) return;

    // Tracks whether any on-disk document was skipped because its bytes didn't
    // load (AgentFs.hydrate logs-and-continues on per-file read failures). When
    // true we must NOT rewrite the manifest below, or a transiently-unreadable
    // slide would be pruned from `.canvas.json` permanently.
    let skippedDocs = false;
    if (resolved.documents.length > 0) {
      const now = Date.now();
      let n = 1;
      for (const d of resolved.documents) {
        const id = stemOf(d.src);
        if (!this.content.has(id)) {
          skippedDocs = true;
          continue;
        }
        // The source manifest entry rides on the resolved doc as `meta`
        // (undefined for a disk-appended slide) — read `createdAt`/`name` off it
        // directly, no re-join against `resolved.manifest`.
        const raw = d.meta;
        const createdAt =
          typeof raw?.createdAt === "number" ? raw.createdAt : now;
        const name = typeof raw?.name === "string" ? raw.name : `Document ${n}`;
        this.createdAt.set(id, createdAt);
        this.docs.push(this.summarize(id, name));
        n++;
      }
      const { activeId } = readAppExt(resolved.ext);
      this.activeId =
        activeId && this.docs.some((d) => d.id === activeId)
          ? activeId
          : (this.docs[0]?.id ?? null);
    }

    if (this.docs.length === 0) this.seedFirstDoc();

    this.hydrated = true;
    // Skip the normalizing rewrite when hydrate had partial read coverage —
    // persisting now would drop the unreadable slide(s) from the manifest.
    if (!skippedDocs) this.persistManifest();
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
    this.persistManifest();
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
    this.persistManifest();
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
    this.persistManifest();
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
    this.persistManifest();
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
    this.persistManifest();
    this.notify();
  }

  setActiveId(id: string): void {
    if (id === this.activeId) return;
    if (!this.docs.some((d) => d.id === id)) return;
    this.persistActive();
    this.switchActive(id);
    this.persistManifest();
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
    this.persistManifest();
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

  /** Rebuild `.canvas.json` from authoritative in-memory state. */
  private buildManifest(): dotcanvas.Manifest {
    return {
      editor: EDITOR,
      documents: this.docs.map((d) => ({
        src: `${d.id}.svg`,
        id: d.id,
        name: d.name,
        createdAt: this.createdAt.get(d.id) ?? Date.now(),
      })),
      ext: {
        [APP_EXT_KEY]: {
          activeId: this.activeId ?? undefined,
        } satisfies AppExt,
      },
    };
  }

  /**
   * Persist the manifest. Writes are chained so concurrent mutations land in
   * call order (the latest snapshot is the last to hit disk). Best-effort,
   * matching the store's fire-and-forget document writes.
   */
  private persistManifest(): void {
    const manifest = this.buildManifest();
    this.manifestWriteChain = this.manifestWriteChain
      .then(() => dotcanvas.write(bundleFs(this.canvasBackend), manifest))
      .catch((err) => {
        console.warn("[svg-doc-store] manifest write failed:", err);
      });
  }
}
