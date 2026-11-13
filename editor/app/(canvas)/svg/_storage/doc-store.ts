import { nanoid } from "nanoid";
import { dotcanvas } from "dotcanvas";
import type { SvgEditor } from "@grida/svg-editor";
import { MemoryBackend, type BundleBackend } from "./backend";
import { bundleFs } from "./bundle-fs";
import { OpfsBackend } from "./opfs-backend";
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
  /** Debounced persist + thumbnail refresh window for active-doc edits.
   *  Default 250 ms. */
  commitDebounceMs?: number;
  /** Bundle storage. Defaults to OPFS under `opfsBase`, or memory where OPFS
   *  is unavailable. */
  backend?: BundleBackend;
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

function pickBackend(opfsBase: readonly string[]): BundleBackend {
  if (OpfsBackend.isSupported()) return new OpfsBackend(opfsBase);
  return new MemoryBackend();
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
 * via `dotcanvas`, over a {@link BundleBackend} (OPFS or memory).
 *
 * The manifest (order + per-doc `name`/`createdAt` + the active id in `ext`)
 * is read with `dotcanvas.read` and rewritten with `dotcanvas.write` on every
 * mutation. The active editor's SVG is serialized on a debounce and written
 * to `/<id>.svg`; a final flush runs whenever the editor detaches.
 *
 * Invariant: `content` holds the last bytes queued to the backend for every
 * document, so an unchanged serialization never re-writes.
 */
export class SvgDocStore {
  private readonly backend: BundleBackend;
  private readonly defaultSvg: string;
  private readonly commitDebounceMs: number;
  /** Serializes every backend write/delete so they land in call order. */
  private io: Promise<void> = Promise.resolve();

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
  private commit_timer: ReturnType<typeof setTimeout> | null = null;
  /** Editor version at the last successful `persistActive`. Guards against
   *  re-serializing on emits that didn't change document state (camera, hover). */
  private last_persisted_version = -1;

  private readonly listeners = new Set<() => void>();

  constructor(opts: SvgDocStoreOptions) {
    this.backend = opts.backend ?? pickBackend(opts.opfsBase);
    this.defaultSvg = opts.defaultSvg;
    this.commitDebounceMs = opts.commitDebounceMs ?? 250;
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
    // Load every SVG document's bytes. A per-file read failure is logged and
    // skipped; the manifest pass below notices the gap.
    const paths = await this.backend.list().catch((err) => {
      console.warn(`[svg-doc-store] backend.list failed:`, err);
      return [] as string[];
    });
    await Promise.all(
      paths.map(async (path) => {
        const id = idFromPath(path);
        if (id == null) return;
        try {
          const content = await this.backend.read(path);
          if (content != null) this.content.set(id, content);
        } catch (err) {
          console.warn(`[svg-doc-store] backend.read(${path}) failed:`, err);
        }
      })
    );
    if (this.disposed) return;

    // Read the manifest. `dotcanvas.read` reconciles it against disk: it skips
    // documents whose file is missing, appends on-disk SVGs the manifest omits,
    // and derives the list from disk entirely when `.canvas.json` is absent.
    const resolved = await dotcanvas.read(bundleFs(this.backend));
    if (this.disposed) return;

    // Tracks whether any on-disk document was skipped because its bytes didn't
    // load (the read pass above logs-and-continues on failures). When
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
    this.flushAndDetach();
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
    this.writeDoc(id, content);
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

    this.content.delete(id);
    this.createdAt.delete(id);
    this.deleteDoc(id);

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

    for (const d of this.docs) this.deleteDoc(d.id);
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

  /** Final-flush the active editor's bytes, then drop editor refs. */
  private flushAndDetach(): void {
    this.clearCommitTimer();
    this.persistActive();
    this.releaseEditor();
  }

  /** Detach without flushing — used by `removeDoc` / `reset`, where the
   *  document file is about to be deleted. */
  private detachEditorWithoutFlush(): void {
    this.clearCommitTimer();
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

  /** Snapshot the active editor into the content cache + summary and queue
   *  the bytes to the backend. Returns `true` if bytes actually changed.
   *  Skips entirely when the editor's version hasn't moved since the last
   *  call. */
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
    this.writeDoc(id, svg);
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
    this.writeDoc(id, content);
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

  /** Persist a snapshot of the manifest (built now, written in order). */
  private persistManifest(): void {
    const manifest = this.buildManifest();
    this.enqueue("manifest write", () =>
      dotcanvas.write(bundleFs(this.backend), manifest)
    );
  }

  private writeDoc(id: string, svg: string): void {
    this.enqueue(`write ${pathOf(id)}`, () =>
      this.backend.write(pathOf(id), svg)
    );
  }

  private deleteDoc(id: string): void {
    this.enqueue(`delete ${pathOf(id)}`, () => this.backend.delete(pathOf(id)));
  }

  /**
   * Chain one backend operation behind every earlier one, so a document's
   * writes and deletes (and manifest snapshots) land in call order. Failures
   * are best-effort: logged, and the chain continues.
   */
  private enqueue(label: string, op: () => Promise<void>): void {
    this.io = this.io.then(op).catch((err) => {
      console.warn(`[svg-doc-store] ${label} failed:`, err);
    });
  }

  /** Resolves once every backend operation queued so far has settled. */
  settled(): Promise<void> {
    return this.io;
  }
}
