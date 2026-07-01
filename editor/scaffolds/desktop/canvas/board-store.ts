import { dotcanvas } from "dotcanvas";
import { workspaces as workspacesNs } from "@/lib/desktop/bridge";
import {
  assertBundleLocalSrc,
  workspaceBundleFs,
  type WorkspaceFsClient,
} from "./workspace-bundle-fs";

/**
 * The desktop BOARD store — the `editor: "board"` sibling of {@link CanvasDeck}.
 *
 * Same shape (manifest-as-truth, pure `dotcanvas` transforms + persist over a
 * bridge fs), but the board's primary axis is **placement** (`layout`), not
 * order, so it adds `setLayout` (the deck never moves documents) and treats a
 * document `src` as either a bundle-local file OR a remote **URI** (a picked
 * library reference, used as-is — the format is URI-capable, so a URI is a
 * first-class placed pin).
 *
 * Framework-agnostic + DI-friendly (no React/Electron) so it unit-tests over a
 * fake bridge, exactly like `CanvasDeck`.
 */

/** One pin as the board UI sees it. `id` is the dotcanvas identity (id, else
 *  src). `layout` is its world placement, or null when unplaced (the host
 *  positions it). `src` is a bundle-relative file path OR an https/URI. */
export type Frame = {
  id: string;
  src: string;
  layout: dotcanvas.Layout | null;
};

/** A document `src` that points outside the bundle — a remote reference (URL),
 *  not a bundle-local file. URI pins are used as-is (never a local file op).
 *  Re-exported from `dotcanvas`, which owns the URI-vs-file distinction for the
 *  `.canvas` format, so the board view and the format resolver can never drift. */
export const isUriSrc = dotcanvas.isUriSrc;

function layoutOf(d: { layout?: unknown }): dotcanvas.Layout | null {
  return d.layout && typeof d.layout === "object"
    ? (d.layout as dotcanvas.Layout)
    : null;
}

function framesFromManifest(m: dotcanvas.Manifest): Frame[] {
  return (m.documents ?? [])
    .filter((d) => typeof d?.src === "string" && d.src.length > 0)
    .map((d) => ({
      id: typeof d.id === "string" && d.id ? d.id : d.src,
      src: d.src,
      layout: layoutOf(d),
    }));
}

export class CanvasBoard {
  private manifest: dotcanvas.Manifest = { editor: "board", documents: [] };
  private frames: Frame[] = [];
  private readonly fs: dotcanvas.WritableFs;
  private readonly listeners = new Set<() => void>();
  private writeChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly workspaceId: string,
    private readonly client: WorkspaceFsClient = workspacesNs,
    /** Workspace-relative dir of the `.canvas` bundle; "" when it IS the root. */
    private readonly basePath = ""
  ) {
    this.fs = workspaceBundleFs(workspaceId, client, basePath);
  }

  // ── snapshots ──────────────────────────────────────────────────────
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getFrames = (): readonly Frame[] => this.frames;

  private notify(): void {
    for (const l of this.listeners) l();
  }

  // ── lifecycle ──────────────────────────────────────────────────────

  /** Read `.canvas.json` and reconcile it against the on-disk files. Mirrors
   *  `CanvasDeck.load` — carry the RECONCILED manifest so an agent edit shows up
   *  and a later persist writes disk truth, not stale entries. */
  async load(): Promise<void> {
    const resolved = await dotcanvas.read(this.fs);
    const documents = resolved.documents.map(
      (d) => d.meta ?? { src: d.src, id: d.id }
    );
    this.manifest = {
      ...(resolved.manifest ?? { editor: "board" }),
      documents,
    };
    this.frames = framesFromManifest(this.manifest);
    this.notify();
  }

  // ── mutations (transform + persist) ────────────────────────────────

  /** Place / move / resize a pin (or clear its placement with `null`). */
  async setLayout(
    idOrSrc: string,
    layout: dotcanvas.Layout | null
  ): Promise<void> {
    this.manifest = dotcanvas.setLayout(this.manifest, idOrSrc, layout);
    this.commit();
  }

  /** Add a pin. `src` is a URI (library reference, used as-is) or a
   *  bundle-relative file already written to disk (e.g. a materialized output).
   *  Manifest-only — unlike `CanvasDeck.addSlide`, the board never authors the
   *  bytes (a URI has none; a file is placed by whoever produced it). */
  async addFrame(src: string, layout?: dotcanvas.Layout): Promise<void> {
    this.manifest = dotcanvas.add(this.manifest, {
      src,
      ...(layout ? { layout } : {}),
    });
    this.commit();
  }

  /** Drop a pin from the board (manifest-only; the file/URL is left in place —
   *  a URI has no file, and a bundle file may be referenced elsewhere). */
  async removeFrame(idOrSrc: string): Promise<void> {
    this.manifest = dotcanvas.remove(this.manifest, idOrSrc);
    this.commit();
  }

  // ── internals ──────────────────────────────────────────────────────
  private commit(): void {
    this.frames = framesFromManifest(this.manifest);
    this.notify();
    this.persist();
  }

  private persist(): void {
    const manifest = this.manifest;
    this.writeChain = this.writeChain
      .then(() => dotcanvas.write(this.fs, manifest))
      .catch((err) => {
        console.warn("[canvas-board] manifest write failed:", err);
      });
  }

  /** Await any in-flight manifest writes (tests + final flush on unmount). */
  async flush(): Promise<void> {
    await this.writeChain;
  }

  /** The workspace-relative path for a bundle-local `src` (for media_url). A URI
   *  src has no bundle path — callers render it directly. A non-URI `src` is
   *  validated (same guard as `CanvasDeck.abs`) so a hostile/garbled manifest
   *  can't drive `media_url` at a path outside the bundle root — this is the one
   *  chokepoint (`addFrame`/`load` don't validate `src`). */
  bundlePath(src: string): string {
    if (dotcanvas.isUriSrc(src)) return src; // defensive: callers check first
    assertBundleLocalSrc(src);
    return this.basePath ? `${this.basePath}/${src}` : src;
  }
}
