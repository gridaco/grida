/**
 * Imperative focus feedback for a virtualized Library card.
 *
 * Masonic may not mount the destination until after it scrolls into view. This
 * registry follows those mount/unmounts and waits for a short bounded window.
 * It can restore ordinary DOM focus without decoration, or draw the explicit
 * motion/ring feedback used when a user asks to locate a selected thumbnail.
 * No React state or rerender participates.
 */
export class LibraryFocusFeedback {
  static readonly mountWaitMs = 1_000;
  static readonly settleDelayMs = 80;
  static readonly animationMs = 1_100;

  readonly #elements = new Map<string, HTMLElement>();
  readonly #bindings = new Map<string, (element: HTMLElement | null) => void>();
  #frame: number | null = null;
  #motionAnimation: Animation | null = null;
  #ringAnimation: Animation | null = null;
  #ringOverlay: HTMLElement | null = null;
  #request = 0;

  ref(id: string): (element: HTMLElement | null) => void {
    const existing = this.#bindings.get(id);
    if (existing) return existing;

    let mounted: HTMLElement | null = null;
    const binding = (element: HTMLElement | null) => {
      if (element) {
        mounted = element;
        this.#bindings.set(id, binding);
        this.#elements.set(id, element);
        return;
      }
      if (mounted && this.#elements.get(id) === mounted) {
        this.#elements.delete(id);
      }
      mounted = null;
      this.#bindings.delete(id);
    };
    this.#bindings.set(id, binding);
    return binding;
  }

  focus(id: string): void {
    this.#cancelFeedback();
    this.#locate(id, (element) => {
      element
        .querySelector<HTMLButtonElement>("[data-library-card-open]")
        ?.focus({ preventScroll: true });
    });
  }

  flash(id: string, options: { focus?: boolean } = {}): void {
    this.#cancelFeedback();
    this.#locate(id, (element) => {
      if (options.focus) {
        element
          .querySelector<HTMLButtonElement>("[data-library-card-open]")
          ?.focus({ preventScroll: true });
      }
      const timing: KeyframeAnimationOptions = {
        delay: LibraryFocusFeedback.settleDelayMs,
        duration: LibraryFocusFeedback.animationMs,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      };
      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      const ringOverlay = document.createElement("span");
      Object.assign(ringOverlay.style, {
        position: "absolute",
        inset: "0",
        zIndex: "30",
        borderRadius: "inherit",
        pointerEvents: "none",
      });
      element.append(ringOverlay);
      this.#ringOverlay = ringOverlay;

      const motionAnimation = reducedMotion
        ? null
        : element.animate(
            [
              { transform: "scale(1)" },
              { transform: "rotate(0deg) scale(1.015)", offset: 0.13 },
              { transform: "rotate(-2deg) scale(1.015)", offset: 0.22 },
              { transform: "rotate(2deg) scale(1.015)", offset: 0.34 },
              {
                transform: "rotate(-1.5deg) scale(1.015)",
                offset: 0.46,
              },
              { transform: "rotate(1.1deg) scale(1.015)", offset: 0.58 },
              { transform: "rotate(-0.7deg) scale(1.015)", offset: 0.7 },
              {
                transform: "rotate(0.35deg) scale(1.015)",
                offset: 0.82,
              },
              { transform: "rotate(0deg) scale(1.015)", offset: 0.9 },
              { transform: "scale(1)" },
            ],
            timing
          );
      const ringAnimation = ringOverlay.animate(
        reducedMotion
          ? [
              { boxShadow: "0 0 0 4px rgb(251 191 36 / 1)" },
              { boxShadow: "0 0 0 4px rgb(251 191 36 / 0)" },
            ]
          : [
              { boxShadow: "0 0 0 0 rgb(251 191 36 / 0)" },
              {
                boxShadow: "0 0 0 4px rgb(251 191 36 / 1)",
                offset: 0.22,
              },
              {
                boxShadow: "0 0 0 4px rgb(251 191 36 / 1)",
                offset: 0.7,
              },
              { boxShadow: "0 0 0 9px rgb(251 191 36 / 0)" },
            ],
        reducedMotion ? { duration: 500, easing: "ease-out" } : timing
      );
      this.#motionAnimation = motionAnimation;
      this.#ringAnimation = ringAnimation;

      const clearMotion = () => {
        if (this.#motionAnimation === motionAnimation) {
          this.#motionAnimation = null;
        }
      };
      const clearRing = () => {
        if (this.#ringAnimation !== ringAnimation) return;
        this.#ringAnimation = null;
        if (this.#ringOverlay === ringOverlay) {
          this.#ringOverlay = null;
          ringOverlay.remove();
        }
      };
      if (motionAnimation) {
        motionAnimation.onfinish = clearMotion;
        motionAnimation.oncancel = clearMotion;
      }
      ringAnimation.onfinish = clearRing;
      ringAnimation.oncancel = clearRing;
    });
  }

  dispose(): void {
    this.#request++;
    this.#cancelFrame();
    this.#cancelFeedback();
    this.#elements.clear();
    this.#bindings.clear();
  }

  #cancelFrame(): void {
    if (this.#frame === null) return;
    cancelAnimationFrame(this.#frame);
    this.#frame = null;
  }

  #locate(id: string, found: (element: HTMLElement) => void): void {
    this.#cancelFrame();
    const request = ++this.#request;
    const deadline = performance.now() + LibraryFocusFeedback.mountWaitMs;
    const locate = () => {
      if (request !== this.#request) return;
      const element = this.#elements.get(id);
      if (element?.isConnected) {
        this.#frame = null;
        found(element);
        return;
      }
      if (performance.now() >= deadline) {
        this.#frame = null;
        return;
      }
      this.#frame = requestAnimationFrame(locate);
    };
    this.#frame = requestAnimationFrame(locate);
  }

  #cancelFeedback(): void {
    const motionAnimation = this.#motionAnimation;
    this.#motionAnimation = null;
    motionAnimation?.cancel();

    const ringAnimation = this.#ringAnimation;
    this.#ringAnimation = null;
    ringAnimation?.cancel();

    const ringOverlay = this.#ringOverlay;
    this.#ringOverlay = null;
    ringOverlay?.remove();
  }
}
