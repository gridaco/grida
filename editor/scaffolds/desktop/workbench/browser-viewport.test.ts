import { afterEach, describe, expect, it, vi } from "vitest";
import type { DesktopBrowser } from "@grida/desktop-bridge";
import { BrowserViewport } from "./browser-viewport";

describe("BrowserViewport.intersects", () => {
  it("hides only when an overlay has positive overlap with the page slot", () => {
    const page = { x: 100, y: 50, width: 400, height: 300 };
    expect(
      BrowserViewport.intersects(page, { x: 90, y: 0, width: 20, height: 100 })
    ).toBe(true);
    expect(
      BrowserViewport.intersects(page, { x: 0, y: 0, width: 100, height: 50 })
    ).toBe(false);
    expect(
      BrowserViewport.intersects(page, { x: 100, y: 50, width: 0, height: 100 })
    ).toBe(false);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BrowserViewport visibility", () => {
  it("hides an overlapping portal and restores the same page slot after dismissal", () => {
    const frames: FrameRequestCallback[] = [];
    const page = { x: 100, y: 50, width: 600, height: 400 };
    const properties = new Map<string, string>();
    const slot = {
      getBoundingClientRect: () => page,
      contains: () => false,
      parentElement: null,
      closest: () => null,
      style: {
        getPropertyValue: (name: string) => properties.get(name) ?? "",
        setProperty: (name: string, value: string) =>
          properties.set(name, value),
      },
    };
    const menu = {
      getBoundingClientRect: () => ({ x: 150, y: 30, width: 200, height: 150 }),
    };
    let overlays: (typeof menu)[] = [];
    let mutation: () => void = () => {};
    vi.stubGlobal("window", {
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        frames.push(callback);
        return frames.length;
      },
      cancelAnimationFrame: () => {},
      getComputedStyle: () => ({
        transform: "none",
        display: "block",
        visibility: "visible",
      }),
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    vi.stubGlobal("document", {
      body: {},
      hidden: false,
      querySelectorAll: () => overlays,
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      }
    );
    vi.stubGlobal(
      "MutationObserver",
      class {
        constructor(callback: () => void) {
          mutation = callback;
        }
        observe() {}
        disconnect() {}
      }
    );
    const flush = () => {
      for (const callback of frames.splice(0)) callback(0);
    };
    const layouts: DesktopBrowser.Layout[] = [];
    const viewport = new BrowserViewport((layout) => layouts.push(layout));
    const disconnect = viewport.connect(slot as unknown as HTMLElement);
    viewport.setActive(true);
    flush();
    expect(layouts.at(-1)?.visible).toBe(true);
    expect(layouts.at(-1)?.rect).toEqual(page);
    overlays = [menu];
    mutation();
    flush();
    expect(layouts.at(-1)?.visible).toBe(false);
    overlays = [];
    mutation();
    flush();
    expect(layouts.at(-1)?.visible).toBe(true);
    viewport.setActive(false);
    expect(layouts.at(-1)?.visible).toBe(false);
    const count = layouts.length;
    mutation();
    flush();
    expect(layouts).toHaveLength(count);
    disconnect();
  });
});

describe("BrowserViewport frame clipping", () => {
  it("shares the frame's resolved inner radius and republishes CSS-only radius changes", () => {
    const frames: FrameRequestCallback[] = [];
    const bounds = { x: 101, y: 145, width: 600, height: 400 };
    const surface = {
      getBoundingClientRect: () => ({
        x: 100,
        y: 100,
        width: 602,
        height: 446,
      }),
      parentElement: null,
    };
    const properties = new Map<string, string>();
    const slot = {
      getBoundingClientRect: () => bounds,
      contains: () => false,
      parentElement: null,
      closest: () => surface,
      style: {
        getPropertyValue: (name: string) => properties.get(name) ?? "",
        setProperty: (name: string, value: string) =>
          properties.set(name, value),
      },
    };
    let radius = "12px";
    let border = "1px";
    let mutation: () => void = () => {};
    vi.stubGlobal("window", {
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        frames.push(callback);
        return frames.length;
      },
      cancelAnimationFrame: () => {},
      getComputedStyle: () => ({
        transform: "none",
        display: "block",
        visibility: "visible",
        borderBottomLeftRadius: radius,
        borderLeftWidth: border,
        borderBottomWidth: border,
      }),
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    vi.stubGlobal("document", {
      body: {},
      hidden: false,
      querySelectorAll: () => [],
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      }
    );
    vi.stubGlobal(
      "MutationObserver",
      class {
        constructor(callback: () => void) {
          mutation = callback;
        }
        observe() {}
        disconnect() {}
      }
    );
    const flush = () => {
      for (const callback of frames.splice(0)) callback(0);
    };
    const layouts: DesktopBrowser.Layout[] = [];
    const viewport = new BrowserViewport((layout) => layouts.push(layout));
    const disconnect = viewport.connect(slot as unknown as HTMLElement);
    viewport.setActive(true);
    flush();
    expect(layouts.at(-1)?.borderRadius).toBe(11);
    expect(properties.get("--browser-page-radius")).toBe("11px");

    radius = "20.5px";
    mutation();
    flush();
    expect(layouts.at(-1)?.rect).toEqual(bounds);
    expect(layouts.at(-1)?.borderRadius).toBe(19.5);
    expect(properties.get("--browser-page-radius")).toBe("19.5px");
    expect(layouts).toHaveLength(2);

    border = "2.5px";
    mutation();
    flush();
    expect(layouts.at(-1)?.borderRadius).toBe(18);
    expect(properties.get("--browser-page-radius")).toBe("18px");

    radius = "0px";
    mutation();
    flush();
    expect(layouts.at(-1)?.borderRadius).toBe(0);
    expect(properties.get("--browser-page-radius")).toBe("0px");
    disconnect();
  });
});
