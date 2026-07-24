type Rect = Readonly<{
  left: number;
  top: number;
  right: number;
  bottom: number;
}>;

type VisibleRect = Rect &
  Readonly<{
    width: number;
    height: number;
  }>;

/**
 * Native `no-drag` rectangles for tabs inside the horizontally scrolling
 * editor rail.
 *
 * Chromium does not clip `-webkit-app-region` boxes to an ancestor's
 * scrollport. The moving tab nodes therefore carry no app-region declaration.
 * This controller mirrors only their visible intersections onto stationary,
 * pointer-transparent exclusion rectangles outside the scroller.
 */
export namespace TabNativeDragRegion {
  export const TARGET_ATTRIBUTE = "data-tab-native-drag-region-target";
  export const EXCLUSION_ATTRIBUTE = "data-tab-native-drag-region-exclusion";

  export function intersection(
    target: Rect,
    viewport: Rect
  ): VisibleRect | null {
    const left = Math.max(target.left, viewport.left);
    const top = Math.max(target.top, viewport.top);
    const right = Math.min(target.right, viewport.right);
    const bottom = Math.min(target.bottom, viewport.bottom);
    if (right <= left || bottom <= top) return null;
    return {
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top,
    };
  }

  export class Controller {
    private resizeObserver: ResizeObserver | null = null;

    constructor(
      private readonly viewport: HTMLElement,
      private readonly exclusionLayer: HTMLElement
    ) {}

    connect(): void {
      if (this.resizeObserver) return;

      this.resizeObserver = new ResizeObserver(this.reconcile);
      this.resizeObserver.observe(this.viewport);
      for (const target of this.targets()) {
        this.resizeObserver.observe(target);
      }
      this.viewport.addEventListener("scroll", this.reconcile, {
        passive: true,
      });
      this.reconcile();
    }

    dispose(): void {
      this.viewport.removeEventListener("scroll", this.reconcile);
      this.resizeObserver?.disconnect();
      this.resizeObserver = null;
    }

    readonly reconcile = (): void => {
      const exclusions = this.exclusions();
      const visibleExclusions = new Map<HTMLElement, VisibleRect>();
      const viewportRect = this.viewport.getBoundingClientRect();
      const layerRect = this.exclusionLayer.getBoundingClientRect();

      // Finish all layout reads before writing overlay styles. This runs on
      // every horizontal scroll event and must not force a layout per tab.
      for (const target of this.targets()) {
        const id = target.getAttribute(TARGET_ATTRIBUTE);
        if (id === null) continue;
        const exclusion = exclusions.get(id);
        if (!exclusion) continue;

        const visible = intersection(
          target.getBoundingClientRect(),
          viewportRect
        );
        if (visible) visibleExclusions.set(exclusion, visible);
      }

      for (const exclusion of exclusions.values()) {
        const visible = visibleExclusions.get(exclusion);
        if (!visible) {
          if (exclusion.style.display !== "none") {
            exclusion.style.display = "none";
          }
          continue;
        }

        this.setStyle(exclusion, {
          display: "block",
          left: `${visible.left - layerRect.left}px`,
          top: `${visible.top - layerRect.top}px`,
          width: `${visible.width}px`,
          height: `${visible.height}px`,
        });
      }
    };

    private targets(): NodeListOf<HTMLElement> {
      return this.viewport.querySelectorAll<HTMLElement>(
        `[${TARGET_ATTRIBUTE}]`
      );
    }

    private exclusions(): Map<string, HTMLElement> {
      const exclusions = new Map<string, HTMLElement>();
      for (const element of this.exclusionLayer.querySelectorAll<HTMLElement>(
        `[${EXCLUSION_ATTRIBUTE}]`
      )) {
        const id = element.getAttribute(EXCLUSION_ATTRIBUTE);
        if (id !== null) exclusions.set(id, element);
      }
      return exclusions;
    }

    private setStyle(
      element: HTMLElement,
      style: Readonly<
        Pick<
          CSSStyleDeclaration,
          "display" | "left" | "top" | "width" | "height"
        >
      >
    ): void {
      for (const property of Object.keys(style) as Array<keyof typeof style>) {
        if (element.style[property] !== style[property]) {
          element.style[property] = style[property];
        }
      }
    }
  }
}
