import type { DesktopBrowser } from "@grida/desktop-bridge";

/**
 * Coordinates a native page slot with DOM layout and portal-based overlays.
 * Changes are event-driven and coalesced to one animation frame; no polling.
 */
export class BrowserViewport {
  private element: HTMLElement | null = null;
  private surface: HTMLElement | null = null;
  private resize?: ResizeObserver;
  private mutations?: MutationObserver;
  private frame = 0;
  private sequence = 0;
  private active = false;
  private dragging = false;
  private last = "";
  private occluded = false;

  constructor(
    private readonly send: (layout: DesktopBrowser.Layout) => void,
    private readonly onOcclusion: (occluded: boolean) => void = () => {}
  ) {}

  connect(element: HTMLElement): () => void {
    this.element = element;
    this.surface = element.closest<HTMLElement>("[data-browser-frame]");
    this.resize = new ResizeObserver(this.schedule);
    this.resize.observe(element);
    if (this.surface) this.resize.observe(this.surface);
    this.mutations = new MutationObserver(this.schedule);
    window.addEventListener("resize", this.schedule);
    window.addEventListener("scroll", this.schedule, true);
    document.addEventListener("visibilitychange", this.schedule);
    document.addEventListener("fullscreenchange", this.schedule);
    document.addEventListener("pointerdown", this.onPointerDown, true);
    window.addEventListener("pointerup", this.onPointerUp, true);
    window.addEventListener("pointercancel", this.onPointerUp, true);
    window.addEventListener("blur", this.onPointerUp);
    this.schedule();
    return () => this.disconnect();
  }

  setActive(active: boolean): void {
    this.active = active;
    this.mutations?.disconnect();
    if (active)
      this.mutations?.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: [
          "data-state",
          "style",
          "class",
          "hidden",
          "aria-hidden",
        ],
      });
    // Hide immediately on selection, before the next frame paints another tab.
    if (!active) this.flush();
    else this.schedule();
  }

  disconnect(): void {
    this.active = false;
    this.flush();
    this.resize?.disconnect();
    this.mutations?.disconnect();
    if (this.frame) window.cancelAnimationFrame(this.frame);
    this.frame = 0;
    window.removeEventListener("resize", this.schedule);
    window.removeEventListener("scroll", this.schedule, true);
    document.removeEventListener("visibilitychange", this.schedule);
    document.removeEventListener("fullscreenchange", this.schedule);
    document.removeEventListener("pointerdown", this.onPointerDown, true);
    window.removeEventListener("pointerup", this.onPointerUp, true);
    window.removeEventListener("pointercancel", this.onPointerUp, true);
    window.removeEventListener("blur", this.onPointerUp);
    this.element = null;
    this.surface = null;
    this.last = "";
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (
      !(event.target instanceof Element) ||
      !event.target.closest('[role="separator"], [data-panel-resize-handle-id]')
    )
      return;
    this.dragging = true;
    this.flush();
  };
  private onPointerUp = (): void => {
    this.dragging = false;
    this.schedule();
  };
  private schedule = (): void => {
    if (!this.element || this.frame || !this.active) return;
    this.frame = window.requestAnimationFrame(() => {
      this.frame = 0;
      this.flush();
    });
  };

  private flush(): void {
    const element = this.element;
    if (!element) return;
    const bounds = element.getBoundingClientRect();
    const rect = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    };
    // CSS owns the frame's style. Both DOM and native page clipping consume
    // its resolved inner radius, including the frame border and theme changes.
    const borderRadius = this.borderRadius(bounds);
    const radius = `${borderRadius}px`;
    if (element.style.getPropertyValue("--browser-page-radius") !== radius)
      element.style.setProperty("--browser-page-radius", radius);
    const occluded = this.active && this.overlapsOverlay(bounds);
    if (occluded !== this.occluded) {
      this.occluded = occluded;
      this.onOcclusion(occluded);
    }
    const visible =
      this.active &&
      !document.hidden &&
      !this.dragging &&
      !occluded &&
      bounds.width > 0 &&
      bounds.height > 0 &&
      !this.transformed(element);
    const signature = JSON.stringify({ rect, visible, borderRadius });
    if (signature === this.last) return;
    this.last = signature;
    this.send({ sequence: ++this.sequence, rect, visible, borderRadius });
  }

  private borderRadius(viewport: DOMRect): number {
    const surface = this.surface;
    if (!surface) return 0;
    const frame = surface.getBoundingClientRect();
    const style = window.getComputedStyle(surface);
    // The owning frame has one uniform radius. A native browser view has the
    // same uniform clip; rounding the DOM viewport also keeps placeholders
    // and native page corners aligned below the toolbar.
    const corner = style.borderBottomLeftRadius.trim().split(/\s+/);
    const length = (value: string, extent: number): number => {
      const number = Number.parseFloat(value);
      return Number.isFinite(number)
        ? value.endsWith("%")
          ? (number / 100) * extent
          : number
        : 0;
    };
    const horizontal = Math.max(
      0,
      Math.min(length(corner[0], frame.width), frame.width / 2) -
        length(style.borderLeftWidth, frame.width)
    );
    const vertical = Math.max(
      0,
      Math.min(length(corner[1] ?? corner[0], frame.height), frame.height / 2) -
        length(style.borderBottomWidth, frame.height)
    );
    return Math.max(
      0,
      Math.min(horizontal, vertical, viewport.width / 2, viewport.height / 2)
    );
  }

  private overlapsOverlay(rect: DOMRect): boolean {
    const overlays = document.querySelectorAll<HTMLElement>(
      [
        '[role="dialog"]',
        '[role="alertdialog"]',
        '[role="menu"]',
        '[role="listbox"]',
        "[data-radix-popper-content-wrapper]",
        '[data-slot="workspace-tab-preview"]',
        '[data-slot="tooltip-content"]',
        '[data-slot="popover-content"]',
        "[data-browser-occluder]",
      ].join(",")
    );
    for (const overlay of overlays) {
      if (this.element?.contains(overlay)) continue;
      const style = window.getComputedStyle(overlay);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const bounds = overlay.getBoundingClientRect();
      if (BrowserViewport.intersects(rect, bounds)) return true;
    }
    return false;
  }

  private transformed(element: HTMLElement): boolean {
    for (
      let ancestor: HTMLElement | null = element;
      ancestor;
      ancestor = ancestor.parentElement
    ) {
      if (window.getComputedStyle(ancestor).transform !== "none") return true;
    }
    return false;
  }

  static intersects(
    a: Pick<DOMRect, "x" | "y" | "width" | "height">,
    b: Pick<DOMRect, "x" | "y" | "width" | "height">
  ): boolean {
    return (
      a.width > 0 &&
      a.height > 0 &&
      b.width > 0 &&
      b.height > 0 &&
      a.x < b.x + b.width &&
      b.x < a.x + a.width &&
      a.y < b.y + b.height &&
      b.y < a.y + a.height
    );
  }
}
