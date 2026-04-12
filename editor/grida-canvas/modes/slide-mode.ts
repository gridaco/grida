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

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface SlideEditorModeConfig {
  /** Slide frame width in scene coordinates. */
  slideWidth: number;
  /** Slide frame height in scene coordinates. */
  slideHeight: number;
  /** Horizontal gap between slides in scene coordinates. */
  slideGap: number;
  /** Camera fit margin in viewport pixels. */
  cameraFitMargin: number;
}

const SLIDE_MODE_DEFAULTS: SlideEditorModeConfig = {
  slideWidth: 1920,
  slideHeight: 1080,
  slideGap: 200,
  cameraFitMargin: 64,
};

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

/**
 * Create a default slide tray prototype.
 *
 * Single source of truth for what a new slide looks like.
 */
export function createDefaultSlidePrototype(
  config: SlideEditorModeConfig = SLIDE_MODE_DEFAULTS,
  overrides: { name?: string; left?: number; top?: number } = {}
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
 */
export function createInitialSlidesDocument(
  config: SlideEditorModeConfig = SLIDE_MODE_DEFAULTS
): editor.state.IEditorStateInit {
  return {
    editable: true,
    debug: false,
    editor_type: "slides",
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

/** Aspect ratio string derived from config, e.g. `"1920 / 1080"`. */
export function slideAspectRatio(
  config: SlideEditorModeConfig = SLIDE_MODE_DEFAULTS
): string {
  return `${config.slideWidth} / ${config.slideHeight}`;
}

// ---------------------------------------------------------------------------
// Pure derivation
// ---------------------------------------------------------------------------

/**
 * Derive the slide list from editor state.
 *
 * This is a pure function — no side effects, no instance state.
 * Used by both `SlideEditorMode` getters and React selectors.
 */
export function deriveSlides(
  state: editor.state.IEditorState
): SlideDescriptor[] {
  const sceneId = state.scene_id;
  if (!sceneId) return [];
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
  return slides;
}

// ---------------------------------------------------------------------------
// Mode
// ---------------------------------------------------------------------------

/**
 * Slide editor mode — a stateless facade over `Editor`.
 *
 * - **No subscriptions.** No `subscribeWithSelector`.
 * - **No cache.** Every getter reads live from `editor.state`.
 * - **No microtasks.** Invariants enforced synchronously via `onPostDispatch`.
 * - **One hook.** A single post-dispatch hook ensures a slide is always
 *   isolated after any state mutation.
 *
 * Usage:
 * ```ts
 * const editor = Editor.createHeadless({ ...createInitialSlidesDocument() });
 * const mode = new SlideEditorMode(editor);
 * mode.addSlide();
 * mode.navigateSlide(1);
 * mode.dispose();
 * ```
 */
export class SlideEditorMode {
  readonly config: Readonly<SlideEditorModeConfig>;
  readonly editor: Editor;

  private _unhook: (() => void) | null = null;

  constructor(editor: Editor, config?: Partial<SlideEditorModeConfig>) {
    this.editor = editor;
    this.config = { ...SLIDE_MODE_DEFAULTS, ...config };

    // Register a single post-dispatch hook for invariant enforcement.
    this._unhook = this.editor.doc.onPostDispatch(this._onPostDispatch);

    // Set initial isolation to the first slide.
    // This runs synchronously — the constructor must only be called
    // in the browser (not during SSR).
    const first = this.slides[0];
    if (first && this.editor.state.isolation_root_node_id === null) {
      this.editor.doc.setIsolation(first.id);
    }
  }

  // ---------------------------------------------------------------------------
  // Queries — all pure, all live from editor.state
  // ---------------------------------------------------------------------------

  /** All root trays in scene order. */
  get slides(): SlideDescriptor[] {
    return deriveSlides(this.editor.state);
  }

  /** Currently isolated slide, or `null`. */
  get currentSlide(): SlideDescriptor | null {
    const id = this.editor.state.isolation_root_node_id;
    if (!id) return null;
    return this.slides.find((s) => s.id === id) ?? null;
  }

  /** The scene id that holds the slides. */
  get sceneId(): string | null {
    return this.editor.state.scene_id ?? null;
  }

  // ---------------------------------------------------------------------------
  // Commands — all synchronous, all read live state
  // ---------------------------------------------------------------------------

  /** Navigate to a slide by 0-based index or node id. */
  goToSlide(target: number | string): void {
    const slides = this.slides;
    const slide =
      typeof target === "number"
        ? slides[target]
        : slides.find((s) => s.id === target);
    if (!slide) return;
    this.editor.doc.setIsolation(slide.id);
    this.editor.commands.select([], "reset");
    this._fitCamera(slide.id);
  }

  /** Navigate relative: -1 = previous, +1 = next. Clamps at boundaries. */
  navigateSlide(offset: -1 | 1): void {
    const slides = this.slides;
    if (slides.length <= 1) return;
    const current = this.currentSlide;
    const currentIdx = current ? current.index : 0;
    const nextIdx = currentIdx + offset;
    if (nextIdx < 0 || nextIdx >= slides.length) return;
    this.goToSlide(nextIdx);
  }

  /**
   * Insert a new slide.
   * @returns The new tray's node id, or `null` if insertion failed.
   */
  addSlide(options?: { afterSlideId?: string }): string | null {
    const sceneId = this.sceneId;
    if (!sceneId) return null;

    const { slideWidth, slideGap } = this.config;
    const slides = this.slides;

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
      // Override auto-placement with deterministic slide-strip position.
      this.editor.doc.changeNodePropertyPositioning(newTrayId, {
        layout_inset_left: left,
        layout_inset_top: 0,
      });
      this.editor.doc.setIsolation(newTrayId);
      this.editor.commands.select([], "reset");
      this._fitCamera(newTrayId);
    }

    return newTrayId ?? null;
  }

  /**
   * Delete a slide. Blocked if it is the last remaining slide.
   * @returns `true` if the slide was deleted.
   */
  deleteSlide(slideId: string): boolean {
    const slides = this.slides;
    if (slides.length <= 1) return false;
    const slide = slides.find((s) => s.id === slideId);
    if (!slide) return false;

    const wasIsolated = this.editor.state.isolation_root_node_id === slideId;
    this.editor.commands.delete([slideId]);

    if (wasIsolated) {
      const remaining = this.slides;
      const targetIdx = Math.min(slide.index, remaining.length - 1);
      if (remaining[targetIdx]) {
        this.goToSlide(targetIdx);
      }
    }

    return true;
  }

  /**
   * Duplicate a slide. Inserts after the original.
   * @returns The new tray's node id, or `null`.
   */
  duplicateSlide(slideId: string): string | null {
    const slide = this.slides.find((s) => s.id === slideId);
    if (!slide) return null;

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
      this._fitCamera(newId);
    }

    return newId ?? null;
  }

  /** Reorder a slide from one index to another. */
  reorderSlide(fromIndex: number, toIndex: number): void {
    const sceneId = this.sceneId;
    if (!sceneId) return;
    const slide = this.slides[fromIndex];
    if (!slide) return;
    this.editor.doc.mv([slide.id], sceneId, toIndex);
  }

  /**
   * Replace the entire document and re-isolate the first slide.
   *
   * Use this instead of `editor.commands.reset()` — it ensures WASM
   * sync completes (during emit) before re-isolation, avoiding
   * re-entrant dispatch issues with subscribeWithSelector memoization.
   */
  resetDocument(state: editor.state.IEditorState, key?: string): void {
    this.editor.doc.reset(state, key);
    // After reset + emit (WASM sync runs during emit), re-isolate.
    const first = this.slides[0];
    if (first) {
      this.editor.doc.setIsolation(first.id);
      this._fitCamera(first.id);
    }
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /** Tear down the post-dispatch hook and clear isolation. */
  dispose(): void {
    if (this._unhook) {
      this._unhook();
      this._unhook = null;
    }
    this.editor.doc.setIsolation(null);
  }

  // ---------------------------------------------------------------------------
  // Post-dispatch hook — the single piece of reactive logic
  // ---------------------------------------------------------------------------

  /**
   * Fit the camera to a slide node. Deferred one frame so WASM layout
   * commits before geometry is queried.
   */
  private _fitCamera(nodeId: string): void {
    if (typeof requestAnimationFrame === "undefined") return;
    requestAnimationFrame(() => {
      this.editor.camera.fit([nodeId], {
        margin: this.config.cameraFitMargin,
      });
    });
  }

  /**
   * Ensures a slide is always isolated after non-reset mutations.
   *
   * Handles:
   * - Slide deletion by external code → isolated slide gone → fall back
   * - Any dispatch that clears isolation unexpectedly
   *
   * Skips `document/reset` — that is handled by {@link resetDocument}
   * to avoid re-entrant dispatch issues with WASM sync subscribers.
   */
  private _onPostDispatch = (
    action: import("@/grida-canvas/action").Action,
    state: Readonly<editor.state.IEditorState>
  ): void => {
    // Skip resets — handled by resetDocument() after emit completes.
    if (action.type === "document/reset") return;

    const slides = deriveSlides(state);
    if (slides.length === 0) return;

    const isolationId = state.isolation_root_node_id;

    // No isolation set → isolate the first slide.
    if (isolationId === null) {
      this.editor.doc.setIsolation(slides[0].id);
      this._fitCamera(slides[0].id);
      return;
    }

    // Isolation points to a node that is not a slide → fall back.
    if (!slides.some((s) => s.id === isolationId)) {
      this.editor.doc.setIsolation(slides[0].id);
      this._fitCamera(slides[0].id);
    }
  };
}
