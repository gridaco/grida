type LayoutInput = {
  count: number;
  focus: number;
  width: number;
  height: number;
};

/**
 * Scroll-driven cover flow. Page position is the sole source of truth: input
 * never passes through a spring or a second animation clock. Only an explicit
 * selection animates, and new input cancels it immediately. Releasing
 * a gesture never changes the scroll position.
 *
 */
export class CoverFlowCarousel {
  static readonly figureWidth = 400;
  static readonly gap = 64;

  static focusAtScroll(
    scrollY: number,
    start: number,
    end: number,
    count: number
  ) {
    if (count < 2 || end <= start) return 0;
    return (
      Math.max(0, Math.min(1, (scrollY - start) / (end - start))) * (count - 1)
    );
  }

  /** Reveal geometry as a mesh exhibit approaches full focus, reversible on scroll. */
  static meshRevealAtFocus(focus: number, index: number) {
    const start = Math.max(0, index - 0.9);
    const progress = Math.max(0, Math.min(1, (focus - start) / 0.9));
    return progress * progress * (3 - 2 * progress);
  }

  static layout({ count, focus, width, height }: LayoutInput) {
    const artworkHeight = Math.max(0, Math.min(500, height - 386));
    const artworkWidth = artworkHeight * 0.72;
    const selected = Math.max(0, Math.min(Math.max(0, count - 1), focus));
    const scales = Array.from({ length: count }, (_, index) => {
      const distance = Math.sqrt((index - selected) ** 2 + 0.04) - 0.2;
      return 0.18 + 0.94 * Math.exp(-0.7 * distance);
    });
    const widths = scales.map((scale) => {
      const expansion = scale - 0.5;
      return (
        artworkWidth *
        (0.5 + (expansion + Math.sqrt(expansion ** 2 + 0.0025)) / 2)
      );
    });
    const centers: number[] = [];
    for (let index = 0; index < count; index++) {
      centers[index] =
        index === 0
          ? widths[index] / 2
          : centers[index - 1] +
            (widths[index - 1] + widths[index]) / 2 +
            this.gap;
    }
    const before = Math.floor(selected);
    const after = Math.min(before + 1, count - 1);
    const anchor = count
      ? centers[before] +
        (centers[after] - centers[before]) * (selected - before)
      : 0;
    // Focus travels within a centered composition; the ribbon remains full bleed.
    const contentWidth = Math.min(1120, width * 0.8);
    const inset = (width - contentWidth) / 2 + (artworkWidth * 1.12) / 2;
    const focalPoint =
      count > 1
        ? inset + ((width - inset * 2) * selected) / (count - 1)
        : width / 2;
    return {
      x: focalPoint - anchor,
      artworkWidth,
      artworkHeight,
      items: scales.map((scale, index) => ({
        x: centers[index] - this.figureWidth / 2,
        scale,
        radius: 4 + ((scale - 0.18) / 0.94) * (18 / 1.12 - 4),
        captionOpacity: Math.max(
          0,
          Math.min(1, (0.6 - Math.abs(index - selected)) / 0.2)
        ),
      })),
    };
  }

  private readonly events = new AbortController();
  private readonly media = matchMedia(
    "(min-width: 901px) and (prefers-reduced-motion: no-preference)"
  );
  private readonly observer: ResizeObserver;
  private readonly stage: HTMLElement;
  private readonly viewport: HTMLElement;
  private readonly ribbon: HTMLElement;
  private readonly slides: {
    figure: HTMLElement;
    artwork: HTMLElement;
    caption: HTMLElement;
    mesh: HTMLElement | null;
  }[];
  private animation: number | null = null;
  private suppressClick = false;
  private drag: {
    id: number;
    x: number;
    y: number;
    scrollY: number;
    locked: boolean;
  } | null = null;
  private disposed = false;

  constructor(private readonly section: HTMLElement) {
    this.stage = section.firstElementChild as HTMLElement;
    this.viewport = section.querySelector<HTMLElement>(
      '[aria-roledescription="carousel"]'
    )!;
    this.ribbon = this.viewport.firstElementChild as HTMLElement;
    this.slides = Array.from(
      this.ribbon.querySelectorAll<HTMLElement>("figure"),
      (figure) => ({
        figure,
        artwork: figure.firstElementChild as HTMLElement,
        caption: figure.querySelector<HTMLElement>("figcaption")!,
        mesh: figure.querySelector<HTMLElement>("[data-model-mesh]"),
      })
    );
    const { signal } = this.events;
    window.addEventListener("scroll", this.onScroll, { passive: true, signal });
    window.addEventListener("wheel", this.onWheelInput, {
      passive: true,
      capture: true,
      signal,
    });
    this.viewport.addEventListener("wheel", this.onWheel, {
      passive: false,
      signal,
    });
    this.viewport.addEventListener("click", this.onClick, { signal });
    window.addEventListener("keydown", this.onKeyDown, { signal });
    window.addEventListener("pointerdown", this.onPointerDown, {
      passive: true,
      signal,
    });
    window.addEventListener("pointerup", this.onPointerUp, { signal });
    window.addEventListener("pointercancel", this.onPointerCancel, { signal });
    this.viewport.addEventListener("pointermove", this.onPointerMove, {
      signal,
    });
    this.viewport.addEventListener("lostpointercapture", this.onPointerCancel, {
      signal,
    });
    this.media.addEventListener("change", this.onResize, { signal });
    this.observer = new ResizeObserver(this.onResize);
    this.observer.observe(this.stage);
    this.observer.observe(this.section);
    this.render();
  }

  private get range() {
    const start = window.scrollY + this.section.getBoundingClientRect().top;
    return {
      start,
      end: start + this.section.offsetHeight - window.innerHeight,
    };
  }

  private get pinned() {
    const { start, end } = this.range;
    return (
      this.media.matches &&
      window.scrollY >= start - 1 &&
      window.scrollY <= end + 1
    );
  }

  private render = () => {
    if (this.disposed) return;
    this.viewport.tabIndex = this.media.matches ? 0 : -1;
    if (!this.media.matches) {
      this.ribbon.style.removeProperty("transform");
      for (const { figure, artwork, caption, mesh } of this.slides) {
        if (artwork instanceof HTMLButtonElement) artwork.disabled = true;
        figure.style.removeProperty("transform");
        figure.style.removeProperty("--model-scale");
        artwork.style.removeProperty("transform");
        artwork.style.removeProperty("border-radius");
        caption.style.removeProperty("opacity");
        mesh?.style.removeProperty("--model-mesh-region");
      }
      return;
    }
    const { start, end } = this.range;
    const focus = CoverFlowCarousel.focusAtScroll(
      window.scrollY,
      start,
      end,
      this.slides.length
    );
    const layout = CoverFlowCarousel.layout({
      count: this.slides.length,
      focus,
      width: this.stage.clientWidth,
      height: this.stage.clientHeight,
    });
    this.ribbon.style.transform = `translate3d(${layout.x}px, 0, 0)`;
    layout.items.forEach((item, index) => {
      const { figure, artwork, caption, mesh } = this.slides[index];
      if (artwork instanceof HTMLButtonElement) artwork.disabled = false;
      artwork.tabIndex = index === Math.round(focus) ? 0 : -1;
      figure.style.transform = `translate3d(${item.x}px, 0, 0)`;
      figure.style.setProperty("--model-scale", String(item.scale));
      artwork.style.transform = `scale(${item.scale})`;
      artwork.style.borderRadius = `${item.radius}px`;
      caption.style.opacity = String(item.captionOpacity);
      if (mesh) {
        const reveal = CoverFlowCarousel.meshRevealAtFocus(focus, index);
        const edge = 100 - reveal * 140;
        // The wipe clips a fixed wrapper; both registered images still zoom together.
        mesh.style.setProperty(
          "--model-mesh-region",
          `polygon(${edge}% 0, 100% 0, 100% 100%, ${edge + 40}% 100%)`
        );
      }
    });
  };

  private interrupt() {
    if (this.animation !== null) cancelAnimationFrame(this.animation);
    this.animation = null;
  }

  private onScroll = () => {
    // One synchronous write pass follows the browser's actual scroll position.
    this.render();
  };

  private animateTo(target: number) {
    this.interrupt();
    const origin = window.scrollY;
    const distance = target - origin;
    const duration = Math.min(950, 650 + Math.abs(distance) * 0.12);
    const started = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = (1 - Math.cos(Math.PI * progress)) / 2;
      this.moveTo(origin + distance * eased);
      this.animation = progress < 1 ? requestAnimationFrame(tick) : null;
    };
    this.animation = requestAnimationFrame(tick);
  }

  private moveTo(top: number) {
    window.scrollTo({ top, behavior: "instant" });
    this.render();
  }

  goTo(index: number) {
    if (!this.media.matches || this.slides.length < 2) return;
    const { start, end } = this.range;
    const selected = Math.max(0, Math.min(this.slides.length - 1, index));
    this.animateTo(
      start + (selected / (this.slides.length - 1)) * (end - start)
    );
  }

  private onWheelInput = () => {
    this.interrupt();
  };

  private onWheel = (event: WheelEvent) => {
    if (event.ctrlKey || !this.pinned) return;
    if (
      !this.viewport.contains(event.target as Node) ||
      Math.abs(event.deltaX) <= Math.abs(event.deltaY) * 1.2
    )
      return;
    const unit =
      event.deltaMode === 1
        ? 16
        : event.deltaMode === 2
          ? this.viewport.clientWidth
          : 1;
    const { start, end } = this.range;
    const target = Math.max(
      start,
      Math.min(end, window.scrollY + event.deltaX * unit)
    );
    if (Math.abs(target - window.scrollY) < 0.5) return;
    event.preventDefault();
    this.moveTo(target);
  };

  private onKeyDown = (event: KeyboardEvent) => {
    if (
      event.target instanceof HTMLElement &&
      event.target.closest("input, textarea, select, [contenteditable=true]")
    )
      return;
    this.interrupt();
    if (!this.media.matches || event.altKey || event.ctrlKey || event.metaKey)
      return;
    const target = event.target as Node;
    if (
      this.viewport.contains(target) &&
      ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
    ) {
      event.preventDefault();
      const { start, end } = this.range;
      const current = CoverFlowCarousel.focusAtScroll(
        window.scrollY,
        start,
        end,
        this.slides.length
      );
      const index =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? this.slides.length - 1
            : event.key === "ArrowRight"
              ? Math.floor(current + 0.001) + 1
              : Math.ceil(current - 0.001) - 1;
      this.goTo(index);
    }
  };

  private onPointerDown = (event: PointerEvent) => {
    this.interrupt();
    this.suppressClick = false;
    if (
      event.button !== 0 ||
      !this.pinned ||
      !this.viewport.contains(event.target as Node)
    )
      return;
    this.drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      scrollY: window.scrollY,
      locked: false,
    };
  };

  private onPointerMove = (event: PointerEvent) => {
    const drag = this.drag;
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.locked) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 5) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        this.drag = null;
        return;
      }
      drag.locked = true;
      this.suppressClick = true;
      this.viewport.setPointerCapture(event.pointerId);
      this.viewport.focus({ preventScroll: true });
      this.viewport.dataset.dragging = "true";
    }
    const { start, end } = this.range;
    const pixelsPerModel = Math.max(
      160,
      Math.min(500, this.stage.clientHeight - 386) * 0.72
    );
    const distance = (end - start) / Math.max(1, this.slides.length - 1);
    this.moveTo(
      Math.max(
        start,
        Math.min(end, drag.scrollY - (dx / pixelsPerModel) * distance)
      )
    );
  };

  private releaseDrag() {
    const drag = this.drag;
    this.drag = null;
    delete this.viewport.dataset.dragging;
    if (drag && this.viewport.hasPointerCapture(drag.id))
      this.viewport.releasePointerCapture(drag.id);
  }

  private onClick = (event: MouseEvent) => {
    if (this.suppressClick) {
      this.suppressClick = false;
      event.preventDefault();
      return;
    }
    if (!(event.target instanceof Element)) return;
    const figure = event.target.closest("figure");
    const index = this.slides.findIndex((slide) => slide.figure === figure);
    if (index >= 0) this.goTo(index);
  };

  private onPointerUp = () => {
    this.releaseDrag();
  };

  private onPointerCancel = (event: PointerEvent) => {
    // Releasing capture after pointerup is not a second gesture cancellation.
    if (event.type === "lostpointercapture" && !this.drag) return;
    this.releaseDrag();
    this.interrupt();
  };

  private onResize = () => {
    this.releaseDrag();
    this.interrupt();
    this.render();
  };

  dispose() {
    this.disposed = true;
    this.interrupt();
    this.releaseDrag();
    this.events.abort();
    this.observer.disconnect();
  }
}
