import init, { type Scene } from "@grida/canvas-wasm";
import cmath from "@grida/cmath";
import locateFile from "./backends/wasm-locate-file";
import { SceneFontLoader } from "./scene-font-loader";

export interface PresentationEngineOptions {
  documentBytes: Uint8Array;
  slideIds: string[];
  sceneId: string;
  images?: Map<string, Uint8Array>;
  startSlide?: number;
}

export type PresentationEngineState = {
  currentIndex: number;
  slideCount: number;
};

export type PresentationEngineListener = (
  state: PresentationEngineState
) => void;

/**
 * Headless presentation controller — owns its own WASM `Scene` instance,
 * fully independent of the editor. Host-agnostic (overlay or separate tab).
 */
export class PresentationEngine {
  private scene: Scene | null = null;
  private slideIds: string[];
  private sceneId: string;
  private currentIndex: number;
  private documentBytes: Uint8Array | null;
  private images: Map<string, Uint8Array> | null;
  private dpr: number = 1;
  private canvasWidth: number = 0;
  private canvasHeight: number = 0;
  private listeners: Set<PresentationEngineListener> = new Set();
  private _imagePollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: PresentationEngineOptions) {
    this.slideIds = options.slideIds;
    this.sceneId = options.sceneId;
    this.currentIndex = options.startSlide ?? 0;
    this.documentBytes = options.documentBytes;
    this.images = options.images ?? new Map();
  }

  async mount(canvas: HTMLCanvasElement, dpr: number = 1): Promise<void> {
    this.dpr = dpr;

    const factory = await init({ locateFile });

    // Re-read canvas dimensions *after* init() — fullscreen may have
    // resized the canvas while we were awaiting the WASM module.
    this.canvasWidth = canvas.width;
    this.canvasHeight = canvas.height;

    this.scene = factory.createWebGLCanvasSurface(canvas, {
      use_embedded_fonts: true,
      config: { skip_layout: false },
    });

    // Load the scene — initial layout runs with embedded fallback fonts.
    this.scene.loadSceneGrida(this.documentBytes!);
    this.scene.switchScene(this.sceneId);
    this.scene.runtime_renderer_set_isolation_stage_preset(0);

    this._applySlide();
    this._startImagePoll();

    // Load missing fonts from Google Fonts (browser-cached if same tab).
    // After fonts arrive, re-apply the slide to trigger relayout + redraw.
    const fontLoader = new SceneFontLoader(this.scene);
    fontLoader.loadMissingFonts().then(() => {
      this._applySlide();
    });

    this.documentBytes = null;
  }

  dispose(): void {
    this._stopImagePoll();
    if (this.scene) {
      this.scene.dispose();
      this.scene = null;
    }
    this.listeners.clear();
  }

  goToSlide(index: number): void {
    const clamped = Math.max(0, Math.min(index, this.slideIds.length - 1));
    if (clamped === this.currentIndex) return;
    this.currentIndex = clamped;
    this._applySlide();
  }

  /** Advance to the next slide. Returns `false` if already at end. */
  next(): boolean {
    if (this.currentIndex >= this.slideIds.length - 1) return false;
    this.currentIndex++;
    this._applySlide();
    return true;
  }

  get isAtEnd(): boolean {
    return this.currentIndex >= this.slideIds.length - 1;
  }

  prev(): boolean {
    if (this.currentIndex <= 0) return false;
    this.currentIndex--;
    this._applySlide();
    return true;
  }

  get slideCount(): number {
    return this.slideIds.length;
  }

  get currentSlideIndex(): number {
    return this.currentIndex;
  }

  resize(width: number, height: number): void {
    this.canvasWidth = width;
    this.canvasHeight = height;
    if (!this.scene) return;
    this.scene.resize(width, height);
    this._fitCamera();
  }

  subscribe(listener: PresentationEngineListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private _applySlide(): void {
    if (!this.scene) return;
    const slideId = this.slideIds[this.currentIndex];
    if (!slideId) return;

    this.scene.runtime_renderer_set_isolation_mode(slideId, 0, 0);
    this._fitCamera();
    this._notify();
  }

  private _fitCamera(): void {
    if (!this.scene) return;
    const slideId = this.slideIds[this.currentIndex];
    if (!slideId) return;

    const bounds = this.scene.getNodeAbsoluteBoundingBox(slideId);
    if (!bounds) return;

    const viewport = {
      x: 0,
      y: 0,
      width: this.canvasWidth / this.dpr,
      height: this.canvasHeight / this.dpr,
    };
    const fitTransform = cmath.ext.viewport.transformToFit(viewport, bounds, 0);
    this._syncTransform(fitTransform);

    // redraw() (not tick()) because setMainCameraTransform doesn't
    // invalidate the frame loop on its own.
    this.scene.redraw();
  }

  /** Convert a viewport transform to a WASM camera matrix (center-aligned + DPR-scaled). */
  private _syncTransform(transform: cmath.Transform): void {
    if (!this.scene) return;

    const toCenter = cmath.transform.translate(cmath.transform.identity, [
      -this.canvasWidth / 2,
      -this.canvasHeight / 2,
    ]);
    const deviceScale: cmath.Transform = [
      [this.dpr, 0, 0],
      [0, this.dpr, 0],
    ];
    const physicalTransform = cmath.transform.multiply(deviceScale, transform);
    const viewMatrix = cmath.transform.multiply(toCenter, physicalTransform);
    this.scene.setMainCameraTransform(cmath.transform.invert(viewMatrix));
  }

  // Image polling — WASM reports missing images lazily (after render passes),
  // so a single drain at mount time is insufficient. Poll until resolved.
  private _resolveImages(): void {
    if (!this.scene || !this.images) return;
    const missing = this.scene.drainMissingImages();
    if (missing.length === 0) {
      this._stopImagePoll();
      return;
    }
    for (const rid of missing) {
      const bytes = this.images.get(rid);
      if (bytes) this.scene.resolveImage(rid, bytes);
    }
  }

  private _startImagePoll(): void {
    if (this._imagePollTimer) return;
    this._imagePollTimer = setInterval(() => this._resolveImages(), 100);
  }

  private _stopImagePoll(): void {
    if (this._imagePollTimer) {
      clearInterval(this._imagePollTimer);
      this._imagePollTimer = null;
    }
    this.images = null;
  }

  private _notify(): void {
    const state: PresentationEngineState = {
      currentIndex: this.currentIndex,
      slideCount: this.slideIds.length,
    };
    for (const listener of this.listeners) {
      listener(state);
    }
  }
}
