import { nanoid } from "nanoid";
import { dotcanvas } from "dotcanvas";
import { workspaces as workspacesNs } from "@/lib/desktop/bridge";
import {
  assertBundleLocalSrc,
  workspaceBundleFs,
  type WorkspaceFsClient,
} from "./workspace-bundle-fs";

// The URI-vs-file predicate is owned by `dotcanvas` (the format). Import it
// straight from the package, not through the sibling `board-store`, so the two
// stores stay independent siblings with no cross-dependency.
const { isUriSrc } = dotcanvas;

/** One slide as the deck UI sees it. `id` is the **dotcanvas identity** (the
 *  doc's `id`, else its `src`) — the key the transforms (`reorder`/`remove`)
 *  match on. `name` is optional view metadata (a web-authored deck may carry
 *  it; desktop-created slides don't). */
export type Slide = { id: string; src: string; name?: string };

/** `WorkspaceFsClient` plus the trash capability `removeSlide` needs. */
export interface WorkspaceDeckClient extends WorkspaceFsClient {
  trashEntry(workspaceId: string, relPath: string): Promise<void>;
}

function slidesFromManifest(m: dotcanvas.Manifest): Slide[] {
  return (
    (m.documents ?? [])
      .filter((d) => typeof d?.src === "string" && d.src.length > 0)
      // A slide is an in-bundle SVG file. A URI `src` (a board's library pin) is
      // NOT a slide — it stays in the manifest (round-trips on persist) but is
      // excluded from the deck view so the slide loader never tries to `readfile`
      // a URL as a bundle path (the `coffee-promo.canvas/https://…` ENOENT).
      .filter((d) => !isUriSrc(d.src as string))
      .map((d) => ({
        // Identity, matching dotcanvas: explicit id, else src.
        id: typeof d.id === "string" && d.id ? d.id : d.src,
        src: d.src,
        name: typeof d.name === "string" ? d.name : undefined,
      }))
  );
}

/**
 * The desktop deck's source of truth: a carried `dotcanvas.Manifest` mutated
 * through the pure `dotcanvas` transforms (`add` / `remove` / `reorder`) and
 * written back. This is the **stateless read-modify-write** consumer the
 * transforms were promoted for (the web store rebuilds the whole manifest
 * instead) — so it's the genuine dogfood.
 *
 * The manifest is the truth; `slides` is derived from it. Each mutation pairs a
 * transform with the matching file op (write / trash the `<src>` SVG), then
 * persists `.canvas.json`. Framework-agnostic + DI-friendly so it's unit-tested
 * over a fake bridge with no React or Electron.
 */
export class CanvasDeck {
  private manifest: dotcanvas.Manifest = { editor: "slides", documents: [] };
  private slides: Slide[] = [];
  private readonly fs: dotcanvas.WritableFs;
  private readonly listeners = new Set<() => void>();
  private writeChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly workspaceId: string,
    private readonly client: WorkspaceDeckClient = workspacesNs,
    /** Workspace-relative dir of the `.canvas` bundle; "" when it IS the root. */
    private readonly basePath = ""
  ) {
    this.fs = workspaceBundleFs(workspaceId, client, basePath);
  }

  /** Map a bundle-relative `src` to its workspace-relative path. Refuses a
   *  non-bundle-local `src` so a hostile/garbled `.canvas.json` can't drive a
   *  file op (notably `trashEntry`) outside the bundle — spec §2: paths are
   *  bundle-root-relative; `..` escape and absolute paths are out of scope. */
  private abs(src: string): string {
    assertBundleLocalSrc(src);
    return this.basePath ? `${this.basePath}/${src}` : src;
  }

  // ── snapshots ──────────────────────────────────────────────────────
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSlides = (): readonly Slide[] => this.slides;

  private notify(): void {
    for (const l of this.listeners) l();
  }

  // ── lifecycle ──────────────────────────────────────────────────────

  /** Read `.canvas.json` and reconcile it against the on-disk SVGs. */
  async load(): Promise<void> {
    const resolved = await dotcanvas.read(this.fs);
    // Carry the RECONCILED manifest (not the raw one) as the round-trip source:
    // a slide added or removed outside the UI — e.g. by the workspace-bound
    // agent — shows up in the strip, and a later persist writes disk truth
    // instead of resurrecting stale entries. Fold the already-resolved view back
    // to a manifest via each doc's `meta` (its source entry; a disk-appended doc
    // has none → minimal `{ src, id }`). Reuses the `resolved` we already hold,
    // so no second `fs.list()` and no risk of reconciling against a newer disk
    // snapshot than the one we render. `editor` is defaulted to "slides" only for
    // an implicit (no .canvas.json) bundle.
    const documents = resolved.documents.map(
      (d) => d.meta ?? { src: d.src, id: d.id }
    );
    this.manifest = {
      ...(resolved.manifest ?? { editor: "slides" }),
      documents,
    };
    this.slides = slidesFromManifest(this.manifest);
    this.notify();
  }

  // ── mutations (transform + file op + persist) ──────────────────────

  /** Create a new slide from `svg` and append it to the deck. */
  async addSlide(svg: string): Promise<string> {
    const id = nanoid();
    const src = `${id}.svg`;
    await this.client.writeFile(this.workspaceId, this.abs(src), svg);
    this.manifest = dotcanvas.add(this.manifest, { src, id });
    this.commit();
    return id;
  }

  /** Drop a slide (by id or src) and move its file to the trash. */
  async removeSlide(idOrSrc: string): Promise<void> {
    const slide = this.slides.find(
      (s) => s.id === idOrSrc || s.src === idOrSrc
    );
    if (!slide) return;
    // Trash first: if the manifest dropped it but the file lingered, the next
    // load would re-append it as a disk-origin slide (it'd reappear).
    await this.client.trashEntry(this.workspaceId, this.abs(slide.src));
    this.manifest = dotcanvas.remove(this.manifest, idOrSrc);
    this.commit();
  }

  /** Reorder the slides view by id/src. */
  async reorder(orderedKeys: string[]): Promise<void> {
    this.manifest = dotcanvas.reorder(this.manifest, orderedKeys);
    this.commit();
  }

  // ── internals ──────────────────────────────────────────────────────

  /** Re-derive slides, notify subscribers, and persist `.canvas.json`. */
  private commit(): void {
    this.slides = slidesFromManifest(this.manifest);
    this.notify();
    this.persist();
  }

  /** Serialize chained so the latest snapshot is the last to hit disk. */
  private persist(): void {
    const manifest = this.manifest;
    this.writeChain = this.writeChain
      .then(() => dotcanvas.write(this.fs, manifest))
      .catch((err) => {
        console.warn("[canvas-deck] manifest write failed:", err);
      });
  }

  /** Await any in-flight manifest writes (tests, and final flush on unmount). */
  async flush(): Promise<void> {
    await this.writeChain;
  }
}
