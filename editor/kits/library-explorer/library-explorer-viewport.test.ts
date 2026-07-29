import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryExplorerItem } from "./library-explorer";
import { LibraryExplorerViewport } from "./library-explorer-viewport";
import type { MasonryScrollPositioner } from "./masonry-scroll";

const item: LibraryExplorerItem = {
  id: "anchor",
  title: "Anchor",
  url: "https://example.com/anchor.png",
  width: 100,
  height: 100,
  mime: "image/png",
};

describe("LibraryExplorerViewport", () => {
  let frames: FrameRequestCallback[];
  let now: number;

  beforeEach(() => {
    frames = [];
    now = 0;
    vi.stubGlobal(
      "requestAnimationFrame",
      (callback: FrameRequestCallback): number => {
        frames.push(callback);
        return frames.length;
      }
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      }
    );
    vi.spyOn(performance, "now").mockImplementation(() => now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("waits for a deep anchor to materialize before correcting raw scroll", () => {
    const listeners = new Map<string, EventListener>();
    const container = {
      scrollTop: 0,
      clientHeight: 600,
      getBoundingClientRect: () => ({ top: 0 }),
      addEventListener: (type: string, listener: EventListener) =>
        listeners.set(type, listener),
      removeEventListener: (type: string) => listeners.delete(type),
    } as unknown as HTMLDivElement;
    const root = {
      clientWidth: 900,
      getBoundingClientRect: () => ({ top: -container.scrollTop }),
    } as unknown as HTMLDivElement;
    const grid = {
      getBoundingClientRect: () => ({ top: 100 - container.scrollTop }),
    } as unknown as HTMLDivElement;
    let anchorTop: number | undefined;
    const positioner: MasonryScrollPositioner = {
      get: () => (anchorTop === undefined ? undefined : { top: anchorTop }),
      range: () => {},
    };
    const settled = vi.fn<() => void>();
    const viewport = new LibraryExplorerViewport();
    viewport.attach(container, root, grid);

    viewport.restore(
      [item],
      positioner,
      {
        scrollTop: 500,
        anchorId: item.id,
        anchorOffset: -80,
      },
      settled
    );
    expect(container.scrollTop).toBe(500);

    frames.shift()?.(now);
    expect(settled).not.toHaveBeenCalled();

    anchorTop = 440;
    frames.shift()?.(now);
    expect(container.scrollTop).toBe(620);
    expect(settled).not.toHaveBeenCalled();

    frames.shift()?.(now);
    expect(settled).toHaveBeenCalledOnce();
    viewport.dispose();
  });

  it("keeps raw scroll as the bounded fallback", () => {
    const container = {
      scrollTop: 0,
      clientHeight: 600,
      getBoundingClientRect: () => ({ top: 0 }),
      addEventListener: () => {},
      removeEventListener: () => {},
    } as unknown as HTMLDivElement;
    const root = {
      clientWidth: 900,
      getBoundingClientRect: () => ({ top: -container.scrollTop }),
    } as unknown as HTMLDivElement;
    const grid = {
      getBoundingClientRect: () => ({ top: 100 - container.scrollTop }),
    } as unknown as HTMLDivElement;
    const positioner: MasonryScrollPositioner = {
      get: () => undefined,
      range: () => {},
    };
    const settled = vi.fn<() => void>();
    const viewport = new LibraryExplorerViewport();
    viewport.attach(container, root, grid);
    viewport.restore(
      [item],
      positioner,
      {
        scrollTop: 500,
        anchorId: item.id,
        anchorOffset: -80,
      },
      settled
    );

    now = LibraryExplorerViewport.anchorWaitMs + 1;
    frames.shift()?.(now);

    expect(container.scrollTop).toBe(500);
    expect(settled).toHaveBeenCalledOnce();
    viewport.dispose();
  });

  it("clears the scrolling state when detaching a route", () => {
    const listeners = new Map<string, EventListener>();
    const container = {
      scrollTop: 120,
      clientHeight: 600,
      getBoundingClientRect: () => ({ top: 0 }),
      addEventListener: (type: string, listener: EventListener) =>
        listeners.set(type, listener),
      removeEventListener: (type: string) => listeners.delete(type),
    } as unknown as HTMLDivElement;
    const root = {
      clientWidth: 900,
      getBoundingClientRect: () => ({ top: -container.scrollTop }),
    } as unknown as HTMLDivElement;
    const grid = {
      getBoundingClientRect: () => ({ top: 100 - container.scrollTop }),
    } as unknown as HTMLDivElement;
    const viewport = new LibraryExplorerViewport();
    const detach = viewport.attach(container, root, grid);

    listeners.get("scroll")?.({} as Event);
    expect(viewport.getSnapshot().isScrolling).toBe(true);

    detach();
    expect(viewport.getSnapshot().isScrolling).toBe(false);
    viewport.dispose();
  });
});
