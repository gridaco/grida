import type { Editor } from "@/grida-canvas/editor";
import type { editor } from "@/grida-canvas";
import type grida from "@grida/schema";
import kolor from "@grida/color";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Strongly-typed descriptor for a single slide.
 *
 * This is the authoritative representation of a slide within the deck.
 * All UI code should consume `SlideDescriptor` instead of ad-hoc
 * `root_ids.filter(id => nodes[id]?.type === "tray")` patterns.
 */
export interface SlideDescriptor {
  /** The tray node id — stable identity. */
  readonly id: string;
  /** 0-based index in the slide deck (scene order). */
  readonly index: number;
  /** The underlying tray node. */
  readonly node: grida.program.nodes.TrayNode;
}

export interface SlideEditorModeConfig {
  /** Slide frame width in scene coordinates. */
  slideWidth: number;
  /** Slide frame height in scene coordinates. */
  slideHeight: number;
  /** Horizontal gap between slides in scene coordinates. */
  slideGap: number;
  /** Auto-fit camera when isolation changes. */
  cameraFitOnIsolation: boolean;
  /** Camera fit margin in viewport pixels. */
  cameraFitMargin: number;
}

const SLIDE_MODE_DEFAULTS: SlideEditorModeConfig = {
  slideWidth: 1920,
  slideHeight: 1080,
  slideGap: 200,
  cameraFitOnIsolation: true,
  cameraFitMargin: 64,
};

// ---------------------------------------------------------------------------
// Factories — single source of truth for slide geometry & document shape
// ---------------------------------------------------------------------------

/**
 * Create a default slide tray node prototype.
 *
 * This is the single source of truth for what a new slide looks like.
 * Used by both {@link SlideEditorMode.addSlide} and
 * {@link createInitialSlidesDocument}.
 */
export function createDefaultSlidePrototype(
  config: SlideEditorModeConfig = SLIDE_MODE_DEFAULTS,
  overrides: {
    name?: string;
    left?: number;
    top?: number;
  } = {}
): grida.program.nodes.NodePrototype & { type: "tray" } {
  return {
    type: "tray",
    name: overrides.name ?? "Slide 1",
    layout_positioning: "absolute",
    layout_inset_left: overrides.left ?? 0,
    layout_inset_top: overrides.top ?? 0,
    layout_target_width: config.slideWidth,
    layout_target_height: config.slideHeight,
    rotation: 0,
    opacity: 1,
    corner_radius: 0,
    fill: {
      type: "solid",
      color: kolor.colorformats.RGBA32F.WHITE,
      active: true,
    },
    stroke_width: 0,
    stroke_align: "inside",
    stroke_cap: "butt",
    stroke_join: "miter",
    children: [],
  };
}

/**
 * Create the initial `IEditorStateInit` for a slides document.
 *
 * Produces a single-scene document with one 16:9 tray. This is the single
 * source of truth for the initial slides document shape — pages should call
 * this instead of manually constructing `SLIDES_DOCUMENT`.
 */
export function createInitialSlidesDocument(
  config: SlideEditorModeConfig = SLIDE_MODE_DEFAULTS
): editor.state.IEditorStateInit {
  return {
    editable: true,
    debug: false,
    document: {
      scenes_ref: ["slides-root"],
      links: {
        "slides-root": ["slide-1"],
      },
      nodes: {
        "slides-root": {
          type: "scene",
          id: "slides-root",
          name: "Slides",
          active: true,
          locked: false,
          guides: [],
          edges: [],
          constraints: { children: "multiple" },
          background_color: kolor.colorformats.RGBA32F.WHITESMOKE,
        },
        "slide-1": {
          type: "tray",
          id: "slide-1",
          name: "Slide 1",
          active: true,
          locked: false,
          layout_positioning: "absolute",
          layout_inset_left: 0,
          layout_inset_top: 0,
          layout_target_width: config.slideWidth,
          layout_target_height: config.slideHeight,
          rotation: 0,
          opacity: 1,
          corner_radius: 0,
          fill: {
            type: "solid",
            color: kolor.colorformats.RGBA32F.WHITE,
            active: true,
          },
          stroke_width: 0,
          stroke_align: "inside",
          stroke_cap: "butt",
          stroke_join: "miter",
        },
      },
    },
  };
}

/** Aspect ratio string derived from config, for use in CSS. e.g. `"16 / 9"`. */
export function slideAspectRatio(
  config: SlideEditorModeConfig = SLIDE_MODE_DEFAULTS
): string {
  return `${config.slideWidth} / ${config.slideHeight}`;
}

/**
 * Slide editor mode — attaches slides-specific behavior to a plain `Editor`.
 *
 * Manages the slide list derivation, slide navigation, creation, deletion,
 * camera-fit-on-isolation, and isolation defaults. All slides-specific logic
 * that was previously scattered across React hooks now lives here.
 *
 * Usage:
 * ```ts
 * const editor = new Editor({ ... });
 * const slides = new SlideEditorMode(editor);
 * slides.addSlide();
 * slides.navigateSlide(1);
 * slides.dispose();
 * ```
 */
export class SlideEditorMode {
  readonly config: Readonly<SlideEditorModeConfig>;
  readonly editor: Editor;

  private _disposables: (() => void)[] = [];
  private _disposed = false;
  private _slides: SlideDescriptor[] = [];

  constructor(editor: Editor, config?: Partial<SlideEditorModeConfig>) {
    this.editor = editor;
    this.config = { ...SLIDE_MODE_DEFAULTS, ...config };
    this._activate();
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  /** All root trays in scene order. Single source of truth for the slide list. */
  get slides(): SlideDescriptor[] {
    return this._slides;
  }

  /** Currently isolated slide, or `null` if no isolation is active. */
  get currentSlide(): SlideDescriptor | null {
    const isolationId = this.editor.state.isolation_root_node_id;
    if (!isolationId) return null;
    return this._slides.find((s) => s.id === isolationId) ?? null;
  }

  /** The scene id that holds the slides. */
  get sceneId(): string | null {
    return this.editor.state.scene_id ?? null;
  }

  // ---------------------------------------------------------------------------
  // Commands
  // ---------------------------------------------------------------------------

  /**
   * Navigate to a slide by 0-based index or node id.
   * Sets isolation and clears selection.
   */
  goToSlide(target: number | string): void {
    const slide =
      typeof target === "number"
        ? this._slides[target]
        : this._slides.find((s) => s.id === target);
    if (!slide) return;
    this.editor.doc.setIsolation(slide.id);
    this.editor.commands.select([], "reset");
  }

  /**
   * Navigate relative: -1 = previous, +1 = next.
   * Clamps at deck boundaries (does not wrap).
   */
  navigateSlide(offset: -1 | 1): void {
    if (this._slides.length <= 1) return;
    const current = this.currentSlide;
    const currentIdx = current ? current.index : 0;
    const nextIdx = currentIdx + offset;
    if (nextIdx < 0 || nextIdx >= this._slides.length) return;
    this.goToSlide(nextIdx);
  }

  /**
   * Insert a new slide.
   *
   * Positioned to the right of the last slide (or after `afterSlideId`).
   * Sets isolation to the new slide. Clears selection.
   *
   * @returns The new tray's node id, or `null` if insertion failed.
   */
  addSlide(options?: { afterSlideId?: string }): string | null {
    const sceneId = this.sceneId;
    if (!sceneId) return null;

    const { slideWidth, slideGap } = this.config;
    const slides = this._slides;

    // Determine insertion position
    let insertAfterIdx = slides.length - 1;
    if (options?.afterSlideId) {
      const found = slides.findIndex((s) => s.id === options.afterSlideId);
      if (found >= 0) insertAfterIdx = found;
    }

    const name = `Slide ${slides.length + 1}`;
    const left = (insertAfterIdx + 1) * (slideWidth + slideGap);

    const prototype = createDefaultSlidePrototype(this.config, { name, left });

    const [newTrayId] = this.editor.doc.insert({ prototype }, null);

    if (newTrayId) {
      this.editor.doc.setIsolation(newTrayId);
      this.editor.commands.select([], "reset");
    }

    return newTrayId ?? null;
  }

  /**
   * Delete a slide by id.
   *
   * Blocked if it is the last remaining slide.
   * If the deleted slide was the currently isolated one, navigates to the
   * nearest neighbor.
   *
   * @returns `true` if the slide was deleted.
   */
  deleteSlide(slideId: string): boolean {
    if (this._slides.length <= 1) return false;
    const slide = this._slides.find((s) => s.id === slideId);
    if (!slide) return false;

    const wasIsolated = this.editor.state.isolation_root_node_id === slideId;

    this.editor.commands.delete([slideId]);

    if (wasIsolated) {
      // Refresh the slide list after deletion
      this._refreshSlides();
      // Navigate to the nearest slide
      const targetIdx = Math.min(slide.index, this._slides.length - 1);
      if (this._slides[targetIdx]) {
        this.goToSlide(targetIdx);
      }
    }

    return true;
  }

  /**
   * Duplicate a slide. The copy is inserted immediately after the original.
   *
   * @returns The duplicated tray's node id, or `null` if duplication failed.
   */
  duplicateSlide(slideId: string): string | null {
    const slide = this._slides.find((s) => s.id === slideId);
    if (!slide) return null;

    // Use the editor's duplicate command, then isolate the new copy.
    // `duplicate` returns void but the new node appears as the last
    // item in the children list. We diff before/after.
    const sceneId = this.sceneId;
    if (!sceneId) return null;

    const linksBefore = new Set(
      this.editor.state.document.links[sceneId] ?? []
    );
    this.editor.commands.duplicate(slideId);
    const linksAfter = this.editor.state.document.links[sceneId] ?? [];
    const newId = linksAfter.find((id) => !linksBefore.has(id));

    if (newId) {
      this.editor.doc.setIsolation(newId);
      this.editor.commands.select([], "reset");
    }

    return newId ?? null;
  }

  /**
   * Reorder a slide from one index to another.
   */
  reorderSlide(fromIndex: number, toIndex: number): void {
    const sceneId = this.sceneId;
    if (!sceneId) return;
    const slide = this._slides[fromIndex];
    if (!slide) return;
    this.editor.doc.mv([slide.id], sceneId, toIndex);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Tear down all subscriptions and clear isolation.
   *
   * Safe to call multiple times. After disposal the mode is inert — all
   * commands are no-ops, deferred microtasks are guarded by `_disposed`.
   */
  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    // Clear isolation so the editor returns to full-scene view.
    this.editor.doc.setIsolation(null);
    for (const unsub of this._disposables) unsub();
    this._disposables = [];
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private _activate(): void {
    // Initial slide list computation
    this._refreshSlides();

    // Subscribe to document changes → refresh slide list
    const unsubDoc = this.editor.doc.subscribeWithSelector(
      (state) => ({
        sceneId: state.scene_id,
        links: state.scene_id
          ? state.document.links[state.scene_id]
          : undefined,
        nodes: state.document.nodes,
      }),
      () => {
        this._refreshSlides();
      }
    );
    this._disposables.push(unsubDoc);

    // Subscribe to isolation → camera fit
    if (this.config.cameraFitOnIsolation) {
      const unsubIsolation = this.editor.doc.subscribeWithSelector(
        (state) => state.isolation_root_node_id,
        (_editor, nodeId) => {
          if (!nodeId) return;
          // Defer one frame so pending WASM layout commits before we
          // read the tray's bounds via camera.fit's geometry query.
          const rafId = requestAnimationFrame(() => {
            this.editor.camera.fit([nodeId], {
              margin: this.config.cameraFitMargin,
            });
          });
          // Store cleanup in case dispose() is called during the frame.
          const cleanup = () => cancelAnimationFrame(rafId);
          this._disposables.push(cleanup);
        }
      );
      this._disposables.push(unsubIsolation);
    }

    // Default isolation to first slide if none is set.
    //
    // Deferred to a microtask: `_activate` may run inside a React
    // `useState` initializer during SSR, where `dispatch` touches
    // `window` (via the viewport API). A microtask safely pushes this
    // into the browser event loop after hydration.
    if (this.editor.state.isolation_root_node_id === null) {
      const first = this._slides[0];
      if (first) {
        const id = first.id;
        queueMicrotask(() => {
          // Guard: mode may have been disposed before the microtask fires.
          if (this._disposed) return;
          this.editor.doc.setIsolation(id);
        });
      }
    }
  }

  private _refreshSlides(): void {
    const state = this.editor.state;
    const sceneId = state.scene_id;
    if (!sceneId) {
      this._slides = [];
      return;
    }
    const rootIds = state.document.links[sceneId] ?? [];
    const nodes = state.document.nodes;
    const slides: SlideDescriptor[] = [];
    let index = 0;
    for (const id of rootIds) {
      const node = nodes[id];
      if (node && node.type === "tray") {
        slides.push({
          id,
          index,
          node: node as grida.program.nodes.TrayNode,
        });
        index++;
      }
    }
    this._slides = slides;
  }
}
