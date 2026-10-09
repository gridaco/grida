/**
 * Scroll composes the workflow; a separate, discrete clock plays the prepared
 * expressions. Stopping the scroll never freezes a blink halfway through.
 */
export class PortraitMotionStory {
  private static readonly variables = [
    ["workspaceReveal", "--portrait-workspace-reveal"],
    ["statesReveal", "--portrait-states-reveal"],
    ["branchesSpread", "--portrait-branches-spread"],
    ["assemble", "--portrait-assemble"],
    ["guideOpacity", "--portrait-guide-opacity"],
    ["resultOpacity", "--portrait-result-opacity"],
    ["originalOpacity", "--portrait-original-opacity"],
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
        position < 0.08
          ? ("source" as const)
          : position < 0.24
            ? ("workspace" as const)
            : position < 0.76
              ? ("states" as const)
              : ("portrait" as const),
      workspaceReveal: this.ease(position, 0.08, 0.22),
      statesReveal: this.ease(position, 0.24, 0.4),
      branchesSpread:
        this.ease(position, 0.24, 0.42) * (1 - this.ease(position, 0.54, 0.72)),
      assemble: this.ease(position, 0.54, 0.76),
      guideOpacity: 1 - this.ease(position, 0.64, 0.78),
      resultOpacity: this.ease(position, 0.76, 0.84),
      originalOpacity: 1 - this.ease(position, 0.68, 0.8),
    };
  }

  /** Prepared eye states, rather than interpolated or invented face geometry. */
  static expressionAt(action: "blink" | "wink", elapsedMs: number) {
    const eye =
      !Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs >= 220
        ? ("open" as const)
        : elapsedMs < 55 || elapsedMs >= 155
          ? ("half" as const)
          : ("closed" as const);
    return {
      eyeLeft: eye,
      eyeRight: action === "blink" ? eye : ("open" as const),
    };
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
  private readonly resizeObserver: ResizeObserver;
  private readonly visibilityObserver: IntersectionObserver;
  private readonly controls: HTMLElement | null;
  private readonly talkButton: HTMLButtonElement | null;
  private animated: boolean | undefined;
  private final = false;
  private visible = false;
  private playbackEligible = false;
  private talking = false;
  private eyeTimer: number | undefined;
  private mouthTimer: number | undefined;
  private autoBlinkTimer: number | undefined;
  private disposed = false;

  constructor(private readonly root: HTMLElement) {
    this.controls = root.querySelector("[data-portrait-controls]");
    this.talkButton = root.querySelector('[data-expression-action="talk"]');
    const stage = root.querySelector("[data-portrait-stage]") ?? root;
    const bounds = stage.getBoundingClientRect();
    this.visible = bounds.bottom > 0 && bounds.top < window.innerHeight;
    const { signal } = this.events;
    window.addEventListener("scroll", this.render, { passive: true, signal });
    window.addEventListener("resize", this.render, { signal });
    this.media.addEventListener("change", this.render, { signal });
    document.addEventListener("visibilitychange", this.updatePlayback, {
      signal,
    });
    root.addEventListener("click", this.onAction, { signal });
    this.resizeObserver = new ResizeObserver(this.render);
    this.resizeObserver.observe(root);
    this.visibilityObserver = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.updatePlayback();
    });
    this.visibilityObserver.observe(stage);
    this.resetExpression();
    this.render();
  }

  private render = () => {
    if (this.disposed) return;
    if (this.animated !== this.media.matches) {
      this.stopPlayback();
      this.playbackEligible = false;
      this.animated = this.media.matches;
    }
    if (!this.animated) {
      this.clearTimeline();
      this.root.dataset.phase = "portrait";
      this.final = true;
      if (this.controls) this.controls.inert = false;
      this.updatePlayback();
      return;
    }

    // This attribute enables the pinned track before measuring its height.
    this.root.dataset.animated = "true";
    const progress = PortraitMotionStory.progress(
      this.root.getBoundingClientRect().top,
      this.root.offsetHeight,
      window.innerHeight
    );
    const state = PortraitMotionStory.evaluate(progress);
    for (const [field, property] of PortraitMotionStory.variables) {
      this.root.style.setProperty(property, String(state[field]));
    }
    this.root.dataset.phase = state.phase;
    this.final = progress >= 0.76;
    if (this.controls) this.controls.inert = state.resultOpacity < 0.98;
    this.updatePlayback();
  };

  private updatePlayback = () => {
    if (this.disposed) return;
    const eligible = this.final && this.visible && !document.hidden;
    if (eligible === this.playbackEligible) return;
    this.playbackEligible = eligible;
    if (eligible) this.scheduleAutoBlink();
    else this.stopPlayback();
  };

  private onAction = (event: MouseEvent) => {
    if (
      !this.playbackEligible ||
      this.controls?.inert ||
      !(event.target instanceof Element)
    ) {
      return;
    }
    const button = event.target.closest<HTMLButtonElement>(
      "button[data-expression-action]"
    );
    if (!button || !this.root.contains(button)) return;
    const action = button.dataset.expressionAction;
    if (action === "blink" || action === "wink") this.playEyes(action);
    else if (action === "talk") this.toggleTalk();
  };

  private playEyes(action: "blink" | "wink") {
    window.clearTimeout(this.eyeTimer);
    window.clearTimeout(this.autoBlinkTimer);
    this.autoBlinkTimer = undefined;
    const frames = [0, 55, 155, 220];
    const play = (index: number) => {
      if (!this.playbackEligible || this.disposed) return;
      const state = PortraitMotionStory.expressionAt(action, frames[index]);
      this.root.dataset.eyeLeft = state.eyeLeft;
      this.root.dataset.eyeRight = state.eyeRight;
      if (index < frames.length - 1) {
        this.eyeTimer = window.setTimeout(
          () => play(index + 1),
          frames[index + 1] - frames[index]
        );
      } else {
        this.eyeTimer = undefined;
        this.scheduleAutoBlink();
      }
    };
    play(0);
  }

  private toggleTalk() {
    this.talking = !this.talking;
    this.talkButton?.setAttribute("aria-pressed", String(this.talking));
    window.clearTimeout(this.mouthTimer);
    this.mouthTimer = undefined;
    if (!this.talking) {
      this.root.dataset.mouth = "rest";
      return;
    }
    // A short cycle of authored mouth states, without implying audio/lip sync.
    const frames = ["o", "a", "o", "rest"] as const;
    const durations = [140, 180, 180, 100];
    const play = (index: number) => {
      if (!this.talking || !this.playbackEligible || this.disposed) return;
      this.root.dataset.mouth = frames[index];
      this.mouthTimer = window.setTimeout(
        () => play((index + 1) % frames.length),
        durations[index]
      );
    };
    play(0);
  }

  private scheduleAutoBlink() {
    // Static and reduced-motion layouts move only after explicit interaction.
    if (
      !this.animated ||
      !this.playbackEligible ||
      this.autoBlinkTimer !== undefined
    ) {
      return;
    }
    this.autoBlinkTimer = window.setTimeout(() => {
      this.autoBlinkTimer = undefined;
      if (this.playbackEligible) this.playEyes("blink");
    }, 3000);
  }

  private resetExpression() {
    this.root.dataset.eyeLeft = "open";
    this.root.dataset.eyeRight = "open";
    this.root.dataset.mouth = "rest";
    this.talking = false;
    this.talkButton?.setAttribute("aria-pressed", "false");
  }

  private stopPlayback() {
    window.clearTimeout(this.eyeTimer);
    window.clearTimeout(this.mouthTimer);
    window.clearTimeout(this.autoBlinkTimer);
    this.eyeTimer = this.mouthTimer = this.autoBlinkTimer = undefined;
    this.resetExpression();
  }

  private clearTimeline() {
    delete this.root.dataset.animated;
    delete this.root.dataset.phase;
    for (const [, property] of PortraitMotionStory.variables) {
      this.root.style.removeProperty(property);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.events.abort();
    this.resizeObserver.disconnect();
    this.visibilityObserver.disconnect();
    this.stopPlayback();
    this.clearTimeline();
    delete this.root.dataset.eyeLeft;
    delete this.root.dataset.eyeRight;
    delete this.root.dataset.mouth;
    if (this.controls) this.controls.inert = false;
  }
}
