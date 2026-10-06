/**
 * Native scroll composes the layers; a separate clock pans the finished scene.
 * Each seamless layer retains only its current loop phase, independent of page layout.
 * The workflow runs at authoring time; playback needs only its artwork and manifest.
 */
export class FXWorldStory {
  private static readonly variables = [
    ["breakout", "--world-breakout"],
    ["layersReveal", "--world-layer-reveal"],
    ["scene", "--world-scene"],
    ["referenceOpacity", "--world-reference-opacity"],
    ["guideOpacity", "--world-guide-opacity"],
    ["resultOpacity", "--world-result-opacity"],
  ] as const;

  static progress(top: number, trackHeight: number, viewportHeight: number) {
    const distance = trackHeight - viewportHeight;
    if (
      !Number.isFinite(top) ||
      !Number.isFinite(distance) ||
      trackHeight <= 0 ||
      viewportHeight <= 0 ||
      distance <= 0
    ) {
      return 0;
    }
    return this.clamp(-top / distance);
  }

  static evaluate(progress: number) {
    const position = this.clamp(progress);
    return {
      phase:
        position < 0.12
          ? ("reference" as const)
          : position < 0.42
            ? ("layers" as const)
            : position < 0.78
              ? ("assemble" as const)
              : ("playback" as const),
      breakout:
        this.ease(position, 0.12, 0.28) * (1 - this.ease(position, 0.42, 0.6)),
      layersReveal: this.ease(position, 0.1, 0.24),
      scene: this.ease(position, 0.56, 0.78),
      referenceOpacity: 1 - this.ease(position, 0.35, 0.5),
      guideOpacity: 1 - this.ease(position, 0.54, 0.68),
      resultOpacity: this.ease(position, 0.78, 0.86),
    };
  }

  /** Compact screens show depth once, assemble, then hand off to the loop. */
  static evaluateMobile(elapsedMs: number) {
    const elapsed = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
    const joined = this.ease(elapsed, 900, 2700);
    return {
      phase:
        elapsed < 900
          ? ("layers" as const)
          : elapsed < 2700
            ? ("assemble" as const)
            : ("playback" as const),
      breakout: 1 - joined,
      layersReveal: 1,
      scene: joined,
      referenceOpacity: 0,
      guideOpacity: 0,
      resultOpacity: this.ease(elapsed, 2450, 2700),
    };
  }

  /** Base camera travel in CSS pixels, before each layer's depth multiplier. */
  static playbackPosition(elapsedMs: number) {
    if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
    return (elapsedMs / 1000) * 27;
  }

  /** Advance a single tile's phase, discarding completed loops. */
  static advancePhase(phase: number, elapsedMs: number, tileWidth: number) {
    return this.panPhase(phase, this.playbackPosition(elapsedMs), tileWidth);
  }

  /** Signed camera movement wraps seamlessly in either direction. */
  static panPhase(phase: number, distance: number, tileWidth: number) {
    const current = Number.isFinite(phase) ? phase - Math.floor(phase) : 0;
    if (
      !Number.isFinite(distance) ||
      !Number.isFinite(tileWidth) ||
      tileWidth <= 0
    ) {
      return current;
    }
    const next = current + distance / tileWidth;
    return next - Math.floor(next);
  }

  private static clamp(value: number) {
    if (Number.isNaN(value)) return 0;
    return Math.max(0, Math.min(1, value));
  }

  private static ease(position: number, start: number, end: number) {
    const t = this.clamp((position - start) / (end - start));
    return t * t * (3 - 2 * t);
  }

  private readonly events = new AbortController();
  private readonly media = matchMedia(
    "(min-width: 901px) and (min-height: 700px) and (prefers-reduced-motion: no-preference)"
  );
  private readonly motion = matchMedia(
    "(prefers-reduced-motion: no-preference)"
  );
  private readonly resizeObserver: ResizeObserver;
  private readonly visibilityObserver: IntersectionObserver;
  private readonly stage: HTMLElement;
  private readonly scene: HTMLElement | null;
  private readonly layers: Array<{
    element: HTMLElement;
    aspectRatio: number;
    speed: number;
    phase: number;
  }>;
  private readonly controls: HTMLElement | null;
  private readonly playButton: HTMLButtonElement | null;
  private readonly playLabel: HTMLElement | null;
  private animated: boolean | undefined;
  private final = false;
  private visible = false;
  private requestedPlayback: boolean | undefined;
  private playing = false;
  private speed = 1;
  private previousTime: number | undefined;
  private frame: number | undefined;
  private disposed = false;
  private drag: { pointerId: number; x: number } | undefined;
  private introElapsed = 0;
  private introTime: number | undefined;
  private introFrame: number | undefined;

  constructor(private readonly root: HTMLElement) {
    this.stage = root.querySelector<HTMLElement>("[data-world-stage]") ?? root;
    this.scene = root.querySelector("[data-world-scene]");
    this.layers = Array.from(
      root.querySelectorAll<HTMLElement>("[data-world-layer]")
    ).map((element) => ({
      element,
      aspectRatio: Number(element.dataset.worldTileRatio),
      speed: Number(element.dataset.worldParallax),
      phase: 0,
    }));
    this.controls = root.querySelector("[data-world-controls]");
    this.playButton = root.querySelector(
      '[data-world-action="toggle-playback"]'
    );
    this.playLabel =
      this.playButton?.querySelector("[data-world-playback-label]") ?? null;
    const speedInput =
      root.querySelector<HTMLInputElement>("[data-world-speed]");
    if (speedInput) this.setSpeed(speedInput.valueAsNumber);
    const { signal } = this.events;
    window.addEventListener("scroll", this.render, { passive: true, signal });
    window.addEventListener("resize", this.render, { signal });
    this.media.addEventListener("change", this.render, { signal });
    this.motion.addEventListener("change", this.onMotionPreference, { signal });
    document.addEventListener("visibilitychange", this.updatePlayback, {
      signal,
    });
    root.addEventListener("click", this.onAction, { signal });
    root.addEventListener("input", this.onSpeed, { signal });
    this.scene?.addEventListener("pointerdown", this.onPointerDown, { signal });
    this.scene?.addEventListener("pointermove", this.onPointerMove, { signal });
    this.scene?.addEventListener("pointerup", this.onPointerEnd, { signal });
    this.scene?.addEventListener("pointercancel", this.onPointerEnd, {
      signal,
    });
    this.scene?.addEventListener("lostpointercapture", this.onPointerEnd, {
      signal,
    });
    this.scene?.addEventListener("keydown", this.onKeyDown, { signal });
    this.resizeObserver = new ResizeObserver(this.render);
    this.resizeObserver.observe(root);
    this.resizeObserver.observe(this.stage);
    this.visibilityObserver = new IntersectionObserver(this.render, {
      threshold: [0, 0.25],
    });
    this.visibilityObserver.observe(this.stage);
    this.renderTravel();
    this.renderPlaybackState();
    this.render();
  }

  private render = () => {
    if (this.disposed) return;
    if (this.animated !== this.media.matches) {
      this.stopPlayback();
      // Changing motion preferences stops explicitly started playback as well.
      if (this.animated !== undefined && this.requestedPlayback === true) {
        this.requestedPlayback = false;
      }
      this.animated = this.media.matches;
      this.introElapsed = 0;
      this.stopIntro();
    }
    if (this.animated) {
      // Enable the pinned layout before measuring its scroll distance.
      this.root.dataset.animated = "true";
      const state = FXWorldStory.evaluate(
        FXWorldStory.progress(
          this.root.getBoundingClientRect().top,
          this.root.offsetHeight,
          window.innerHeight
        )
      );
      for (const [field, property] of FXWorldStory.variables) {
        this.root.style.setProperty(property, String(state[field]));
      }
      this.root.dataset.phase = state.phase;
      this.final = state.resultOpacity >= 0.98;
    } else {
      this.clearTimeline();
      const state = this.motion.matches
        ? FXWorldStory.evaluateMobile(this.introElapsed)
        : FXWorldStory.evaluate(1);
      for (const [field, property] of FXWorldStory.variables) {
        this.root.style.setProperty(property, String(state[field]));
      }
      this.root.dataset.phase = state.phase;
      this.final = state.phase === "playback";
    }
    if (this.controls) this.controls.inert = !this.final;
    if (this.scene) this.scene.inert = !this.final;
    const bounds = this.stage.getBoundingClientRect();
    const visibleHeight =
      Math.min(bounds.bottom, window.innerHeight) - Math.max(bounds.top, 0);
    this.visible =
      visibleHeight >
      (this.animated ? 0 : Math.min(bounds.height, window.innerHeight) * 0.25);
    this.updatePlayback();
    this.renderTravel();
  };

  private updatePlayback = () => {
    if (this.disposed) return;
    const inView = this.visible && !document.hidden;
    if (!this.animated && this.motion.matches && !this.final && inView) {
      if (this.introFrame === undefined)
        this.introFrame = requestAnimationFrame(this.tickIntro);
    } else {
      this.stopIntro();
    }
    const eligible = this.final && inView;
    if (!eligible) this.releaseDrag();
    const requested = this.requestedPlayback ?? this.motion.matches;
    if (eligible && requested && !this.drag) this.startPlayback();
    else this.stopPlayback();
  };

  private tickIntro = (time: number) => {
    this.introFrame = undefined;
    if (this.disposed) return;
    if (this.introTime !== undefined)
      this.introElapsed += Math.max(0, time - this.introTime);
    this.introTime = time;
    this.render();
  };

  private stopIntro() {
    if (this.introFrame !== undefined) cancelAnimationFrame(this.introFrame);
    this.introFrame = undefined;
    this.introTime = undefined;
  }

  private onMotionPreference = () => {
    // A changed motion preference never restarts playback the user paused.
    this.requestedPlayback = false;
    this.render();
  };

  private onPointerDown = (event: PointerEvent) => {
    if (
      !this.final ||
      !this.visible ||
      document.hidden ||
      !this.scene ||
      this.drag ||
      !event.isPrimary ||
      event.button !== 0
    )
      return;
    this.drag = { pointerId: event.pointerId, x: event.clientX };
    this.scene.setPointerCapture(event.pointerId);
    this.root.dataset.dragging = "true";
    this.scene.focus({ preventScroll: true });
    this.updatePlayback();
    event.preventDefault();
  };

  private onPointerMove = (event: PointerEvent) => {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    // The foreground follows the hand; distant layers move less.
    const distance = this.drag.x - event.clientX;
    this.drag.x = event.clientX;
    this.renderTravel(distance);
  };

  private onPointerEnd = (event: PointerEvent) => {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    this.releaseDrag();
    this.updatePlayback();
  };

  private releaseDrag() {
    if (!this.drag) return;
    const { pointerId } = this.drag;
    this.drag = undefined;
    delete this.root.dataset.dragging;
    if (this.scene?.hasPointerCapture(pointerId)) {
      this.scene.releasePointerCapture(pointerId);
    }
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (!this.final || !this.visible || document.hidden || this.drag) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    this.renderTravel(event.key === "ArrowRight" ? 48 : -48);
  };

  private onAction = (event: MouseEvent) => {
    if (
      !this.final ||
      !this.visible ||
      document.hidden ||
      this.controls?.inert ||
      !(event.target instanceof Element)
    ) {
      return;
    }
    const button = event.target.closest<HTMLButtonElement>(
      'button[data-world-action="toggle-playback"]'
    );
    if (!button || !this.root.contains(button)) return;
    this.requestedPlayback = !this.playing;
    this.updatePlayback();
  };

  private onSpeed = (event: Event) => {
    if (
      !(event.target instanceof HTMLInputElement) ||
      !event.target.matches("[data-world-speed]")
    ) {
      return;
    }
    this.setSpeed(event.target.valueAsNumber);
  };

  private setSpeed(value: number) {
    this.speed = Number.isFinite(value)
      ? Math.max(0.25, Math.min(1.75, value))
      : 1;
  }

  private startPlayback() {
    if (this.playing) return;
    this.playing = true;
    this.previousTime = undefined;
    this.renderPlaybackState();
    this.frame = requestAnimationFrame(this.tick);
  }

  private tick = (time: number) => {
    this.frame = undefined;
    if (!this.playing || this.disposed) return;
    const elapsed =
      this.previousTime === undefined
        ? 0
        : Math.max(0, time - this.previousTime);
    this.previousTime = time;
    this.renderTravel(FXWorldStory.playbackPosition(elapsed * this.speed));
    this.frame = requestAnimationFrame(this.tick);
  };

  private renderTravel(distance = 0) {
    // All planes share a height. Read geometry once before writing paint-only
    // offsets. Page-scroll resizing projects the same phase onto the new tile
    // size, rather than replaying all the distance accumulated by autoplay.
    const first = this.layers[0]?.element;
    const height = first ? parseFloat(getComputedStyle(first).height) : 0;
    for (const layer of this.layers) {
      const width = height * layer.aspectRatio;
      if (!Number.isFinite(width) || width <= 0) continue;
      layer.phase = FXWorldStory.panPhase(
        layer.phase,
        distance * layer.speed,
        width
      );
      layer.element.style.setProperty(
        "--layer-travel",
        `${layer.phase * width}px`
      );
    }
  }

  private renderPlaybackState() {
    const label = this.playing ? "Pause motion" : "Play motion";
    this.root.dataset.playback = this.playing ? "playing" : "paused";
    this.playButton?.setAttribute("aria-pressed", String(this.playing));
    this.playButton?.setAttribute("aria-label", label);
    if (this.playLabel) this.playLabel.textContent = label;
  }

  private stopPlayback() {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
    this.previousTime = undefined;
    if (!this.playing) return;
    this.playing = false;
    this.renderPlaybackState();
  }

  private clearTimeline() {
    delete this.root.dataset.animated;
    delete this.root.dataset.phase;
    for (const [, property] of FXWorldStory.variables) {
      this.root.style.removeProperty(property);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.releaseDrag();
    this.events.abort();
    this.resizeObserver.disconnect();
    this.visibilityObserver.disconnect();
    this.stopPlayback();
    this.stopIntro();
    this.clearTimeline();
    for (const layer of this.layers) {
      layer.element.style.removeProperty("--layer-travel");
    }
    delete this.root.dataset.playback;
    if (this.controls) this.controls.inert = false;
    if (this.scene) this.scene.inert = false;
  }
}
