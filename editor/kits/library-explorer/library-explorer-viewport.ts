import type {
  LibraryExplorerItem,
  LibraryExplorerScroll,
} from "./library-explorer";
import { MasonryScroll, type MasonryScrollPositioner } from "./masonry-scroll";

export type LibraryExplorerViewportSnapshot = Readonly<{
  width: number;
  height: number;
  scrollTop: number;
  gridOffsetTop: number;
  isScrolling: boolean;
}>;

type Listener = () => void;

const EMPTY_SNAPSHOT: LibraryExplorerViewportSnapshot = {
  width: 0,
  height: 0,
  scrollTop: 0,
  gridOffsetTop: 0,
  isScrolling: false,
};

/**
 * Imperative owner of the explorer's external scroll viewport.
 *
 * React supplies three mounted elements and subscribes to measurements. This
 * class owns DOM listeners, resize observation, scroll-idle timing, capture,
 * and bounded anchor restoration so those behaviors are not coordinated by a
 * stack of effects.
 */
export class LibraryExplorerViewport {
  static readonly scrollIdleMs = 120;
  static readonly anchorWaitMs = 1_000;

  readonly #listeners = new Set<Listener>();
  #snapshot = EMPTY_SNAPSHOT;
  #container: HTMLDivElement | null = null;
  #root: HTMLDivElement | null = null;
  #grid: HTMLDivElement | null = null;
  #observer: ResizeObserver | null = null;
  #scrollTimer: ReturnType<typeof setTimeout> | null = null;
  #restoreFrame: number | null = null;
  #restoreRequest = 0;

  readonly subscribe = (listener: Listener): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  readonly getSnapshot = (): LibraryExplorerViewportSnapshot => this.#snapshot;

  attach(
    container: HTMLDivElement,
    root: HTMLDivElement,
    grid: HTMLDivElement
  ): () => void {
    this.#detach();
    this.#container = container;
    this.#root = root;
    this.#grid = grid;
    this.#measure();
    this.#observer = new ResizeObserver(this.#measure);
    this.#observer.observe(container);
    this.#observer.observe(root);
    this.#observer.observe(grid);
    container.addEventListener("scroll", this.#onScroll, { passive: true });

    return () => {
      if (
        this.#container === container &&
        this.#root === root &&
        this.#grid === grid
      ) {
        this.#detach();
      }
    };
  }

  capture(
    items: LibraryExplorerItem[],
    positioner: MasonryScrollPositioner
  ): LibraryExplorerScroll {
    const container = this.#container;
    const grid = this.#grid;
    if (!container || !grid) {
      return { scrollTop: 0, anchorId: null, anchorOffset: 0 };
    }
    return MasonryScroll.capture(
      items,
      positioner,
      container.scrollTop,
      LibraryExplorerViewport.offsetTop(container, grid),
      container.clientHeight
    );
  }

  rootOffsetTop(): number {
    const container = this.#container;
    const root = this.#root;
    return container && root
      ? LibraryExplorerViewport.offsetTop(container, root)
      : 0;
  }

  /**
   * Restores raw position immediately, then waits for Masonic to materialize a
   * saved anchor before applying its responsive correction. The raw value stays
   * as the bounded-time fallback.
   */
  restore(
    items: LibraryExplorerItem[],
    positioner: MasonryScrollPositioner,
    saved: LibraryExplorerScroll,
    onSettled: () => void
  ): () => void {
    this.#cancelRestore();
    const container = this.#container;
    const grid = this.#grid;
    if (!container || !grid) {
      onSettled();
      return () => {};
    }

    const request = ++this.#restoreRequest;
    container.scrollTop = saved.scrollTop;
    this.#publish({
      ...this.#snapshot,
      scrollTop: saved.scrollTop,
    });

    const anchorIndex =
      saved.anchorId === null
        ? -1
        : items.findIndex((item) => item.id === saved.anchorId);
    const deadline = performance.now() + LibraryExplorerViewport.anchorWaitMs;

    const settle = () => {
      if (request !== this.#restoreRequest) return;
      this.#restoreFrame = null;
      onSettled();
    };

    const locate = () => {
      if (request !== this.#restoreRequest) return;
      if (anchorIndex < 0) {
        settle();
        return;
      }

      if (positioner.get(anchorIndex)) {
        const target = MasonryScroll.resolve(
          items,
          positioner,
          saved,
          LibraryExplorerViewport.offsetTop(container, grid)
        );
        container.scrollTop = target;
        this.#publish({ ...this.#snapshot, scrollTop: target });
        this.#restoreFrame = requestAnimationFrame(settle);
        return;
      }

      if (performance.now() >= deadline) {
        settle();
        return;
      }
      this.#restoreFrame = requestAnimationFrame(locate);
    };

    this.#restoreFrame = requestAnimationFrame(locate);
    return () => {
      if (request === this.#restoreRequest) this.#cancelRestore();
    };
  }

  dispose(): void {
    this.#detach();
    this.#listeners.clear();
  }

  static offsetTop(container: HTMLDivElement, element: HTMLElement): number {
    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    return elementRect.top - containerRect.top + container.scrollTop;
  }

  readonly #measure = (): void => {
    const container = this.#container;
    const root = this.#root;
    const grid = this.#grid;
    if (!container || !root || !grid) return;
    this.#publish({
      ...this.#snapshot,
      width: root.clientWidth,
      height: container.clientHeight,
      scrollTop: container.scrollTop,
      gridOffsetTop: LibraryExplorerViewport.offsetTop(container, grid),
    });
  };

  readonly #onScroll = (): void => {
    const container = this.#container;
    if (!container) return;
    this.#publish({
      ...this.#snapshot,
      scrollTop: container.scrollTop,
      isScrolling: true,
    });
    if (this.#scrollTimer) clearTimeout(this.#scrollTimer);
    this.#scrollTimer = setTimeout(() => {
      this.#scrollTimer = null;
      this.#publish({ ...this.#snapshot, isScrolling: false });
    }, LibraryExplorerViewport.scrollIdleMs);
  };

  #publish(next: LibraryExplorerViewportSnapshot): void {
    if (
      next.width === this.#snapshot.width &&
      next.height === this.#snapshot.height &&
      next.scrollTop === this.#snapshot.scrollTop &&
      next.gridOffsetTop === this.#snapshot.gridOffsetTop &&
      next.isScrolling === this.#snapshot.isScrolling
    ) {
      return;
    }
    this.#snapshot = Object.freeze(next);
    for (const listener of Array.from(this.#listeners)) listener();
  }

  #cancelRestore(): void {
    this.#restoreRequest++;
    if (this.#restoreFrame !== null) {
      cancelAnimationFrame(this.#restoreFrame);
      this.#restoreFrame = null;
    }
  }

  #detach(): void {
    this.#cancelRestore();
    this.#observer?.disconnect();
    this.#observer = null;
    this.#container?.removeEventListener("scroll", this.#onScroll);
    if (this.#scrollTimer) clearTimeout(this.#scrollTimer);
    this.#scrollTimer = null;
    if (this.#snapshot.isScrolling) {
      this.#publish({ ...this.#snapshot, isScrolling: false });
    }
    this.#container = null;
    this.#root = null;
    this.#grid = null;
  }
}
