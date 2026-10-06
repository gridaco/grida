import { FXWorldStory } from "./fx-world-story";

/** Composes prepared planes on page scroll; only the settled scene autoplays. */
export class CanvasWorldScene {
  static composition(progress: number) {
    const t = Math.max(0, Math.min(1, (progress - 0.48) / 0.22));
    const fade = Math.max(0, Math.min(1, (progress - 0.48) / 0.2));
    const chrome = fade * fade;
    return {
      spread: 1 - t * t * (3 - 2 * t),
      hudOpacity: 1 - chrome * chrome * (3 - 2 * chrome),
      settled: progress >= 0.7,
    };
  }

  private readonly events = new AbortController();
  private readonly media = matchMedia(
    "(min-width: 701px) and (prefers-reduced-motion: no-preference)"
  );
  private readonly track: HTMLElement;
  private readonly resizeObserver: ResizeObserver;
  private readonly visibilityObserver: IntersectionObserver;
  private readonly layers: Array<{
    element: HTMLElement;
    ratio: number;
    speed: number;
    phase: number;
  }>;
  private settled = false;
  private visible = false;
  private previousTime: number | undefined;
  private frame: number | undefined;
  private disposed = false;

  constructor(private readonly root: HTMLElement) {
    this.track = root.closest<HTMLElement>("#canvas") ?? root;
    this.layers = Array.from(
      root.querySelectorAll<HTMLElement>("[data-canvas-world-layer]")
    ).map((element) => ({
      element,
      ratio: Number(element.dataset.tileRatio),
      speed: Number(element.dataset.parallax),
      phase: 0,
    }));
    const { signal } = this.events;
    window.addEventListener("scroll", this.render, { passive: true, signal });
    window.addEventListener("resize", this.render, { signal });
    this.media.addEventListener("change", this.render, { signal });
    document.addEventListener("visibilitychange", this.updatePlayback, {
      signal,
    });
    this.resizeObserver = new ResizeObserver(this.render);
    this.resizeObserver.observe(root);
    this.visibilityObserver = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.updatePlayback();
    });
    this.visibilityObserver.observe(root);
    this.render();
  }

  private render = () => {
    if (this.disposed) return;
    const progress = FXWorldStory.progress(
      this.track.getBoundingClientRect().top,
      this.track.offsetHeight,
      window.innerHeight
    );
    const state = CanvasWorldScene.composition(progress);
    this.settled = state.settled && this.media.matches;
    this.root.style.setProperty(
      "--layer-spread",
      String(this.media.matches ? state.spread : 1)
    );
    this.root.style.setProperty(
      "--layer-hud-opacity",
      String(this.media.matches ? state.hudOpacity : 1)
    );
    const spread = this.media.matches ? state.spread : 1;
    this.root.style.setProperty(
      "--layer-tilt",
      String(16 * spread * spread * (1 - spread) * (1 - spread))
    );
    this.root.dataset.assembling = String(spread > 0 && spread < 1);
    this.root.dataset.settled = String(this.settled);
    const bounds = this.root.getBoundingClientRect();
    this.visible = bounds.bottom > 0 && bounds.top < window.innerHeight;
    this.paint();
    this.updatePlayback();
  };

  private updatePlayback = () => {
    if (this.disposed) return;
    if (this.settled && this.visible && !document.hidden) {
      if (this.frame === undefined)
        this.frame = requestAnimationFrame(this.tick);
    } else {
      if (this.frame !== undefined) cancelAnimationFrame(this.frame);
      this.frame = undefined;
      this.previousTime = undefined;
    }
  };

  private tick = (time: number) => {
    this.frame = undefined;
    if (this.disposed) return;
    const elapsed =
      this.previousTime === undefined
        ? 0
        : Math.max(0, time - this.previousTime);
    this.previousTime = time;
    this.paint(FXWorldStory.playbackPosition(elapsed));
    this.updatePlayback();
  };

  private paint(distance = 0) {
    // Read each plane's layout before writes: their resting sizes differ.
    const planes = this.layers.map((layer) => {
      const style = getComputedStyle(layer.element);
      return {
        layer,
        width: parseFloat(style.width),
        height: parseFloat(style.height),
      };
    });
    for (const { layer, width, height } of planes) {
      if (width <= 0 || height <= 0) continue;
      // Cover the viewport while retaining the original aspect ratio. The
      // same bounded phase projects onto every intermediate expansion size.
      const tileHeight = Math.max(height, width / layer.ratio);
      const tileWidth = tileHeight * layer.ratio;
      layer.phase = FXWorldStory.panPhase(
        layer.phase,
        distance * layer.speed,
        tileWidth
      );
      layer.element.style.setProperty("--tile-width", `${tileWidth}px`);
      layer.element.style.setProperty("--tile-height", `${tileHeight}px`);
      layer.element.style.setProperty(
        "--layer-travel",
        `${layer.phase * tileWidth}px`
      );
    }
  }

  dispose() {
    this.disposed = true;
    this.events.abort();
    this.resizeObserver.disconnect();
    this.visibilityObserver.disconnect();
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
    this.previousTime = undefined;
    this.root.style.removeProperty("--layer-spread");
    this.root.style.removeProperty("--layer-tilt");
    delete this.root.dataset.assembling;
    this.root.style.removeProperty("--layer-hud-opacity");
    delete this.root.dataset.settled;
    for (const { element } of this.layers) {
      for (const property of [
        "--tile-width",
        "--tile-height",
        "--layer-travel",
      ]) {
        element.style.removeProperty(property);
      }
    }
  }
}
