import { afterEach, describe, expect, it, vi } from "vitest";
import { TabNativeDragRegion } from "./tab-native-drag-region";

type TestRect = Readonly<{
  left: number;
  top: number;
  right: number;
  bottom: number;
}>;

function domRect(rect: TestRect): TestRect {
  // DOMRect geometry fields are inherited accessors, not own enumerable fields.
  // Keep the mock faithful so spreading one cannot silently drop coordinates.
  return Object.create({
    get left() {
      return rect.left;
    },
    get top() {
      return rect.top;
    },
    get right() {
      return rect.right;
    },
    get bottom() {
      return rect.bottom;
    },
  }) as TestRect;
}

function element({
  attribute,
  rect,
  display = "",
}: {
  attribute?: readonly [string, string];
  rect: TestRect;
  display?: string;
}): HTMLElement {
  const attributes = new Map(attribute ? [attribute] : []);
  const bounds = domRect(rect);
  return {
    style: { display },
    getAttribute: (name: string) => attributes.get(name) ?? null,
    getBoundingClientRect: () => bounds,
  } as unknown as HTMLElement;
}

function container(rect: TestRect, children: readonly HTMLElement[]) {
  const addEventListener = vi.fn<HTMLElement["addEventListener"]>();
  const removeEventListener = vi.fn<HTMLElement["removeEventListener"]>();
  return {
    element: {
      style: {},
      getBoundingClientRect: () => rect,
      querySelectorAll: () => children,
      addEventListener,
      removeEventListener,
    } as unknown as HTMLElement,
    addEventListener,
    removeEventListener,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("TabNativeDragRegion.intersection", () => {
  const viewport = { left: 100, top: 0, right: 500, bottom: 44 };

  it("keeps a fully visible tab rectangle", () => {
    expect(
      TabNativeDragRegion.intersection(
        { left: 160, top: 10, right: 280, bottom: 34 },
        viewport
      )
    ).toEqual({
      left: 160,
      top: 10,
      right: 280,
      bottom: 34,
      width: 120,
      height: 24,
    });
  });

  it("clips a partially scrolled tab to the viewport", () => {
    expect(
      TabNativeDragRegion.intersection(
        { left: 40, top: 10, right: 180, bottom: 34 },
        viewport
      )
    ).toEqual({
      left: 100,
      top: 10,
      right: 180,
      bottom: 34,
      width: 80,
      height: 24,
    });
  });

  it("rejects an offscreen tab rectangle", () => {
    expect(
      TabNativeDragRegion.intersection(
        { left: -100, top: 10, right: 80, bottom: 34 },
        viewport
      )
    ).toBeNull();
  });
});

describe("TabNativeDragRegion.Controller", () => {
  it("mirrors clipped tabs and their following gaps while clearing stale overlays", () => {
    const targetOffscreen = element({
      attribute: [TabNativeDragRegion.TARGET_ATTRIBUTE, "offscreen"],
      rect: { left: -100, top: 8, right: 36, bottom: 36 },
    });
    const targetA = element({
      attribute: [TabNativeDragRegion.TARGET_ATTRIBUTE, "a"],
      rect: { left: 40, top: 8, right: 180, bottom: 36 },
    });
    const targetB = element({
      attribute: [TabNativeDragRegion.TARGET_ATTRIBUTE, "b"],
      rect: { left: 184, top: 8, right: 300, bottom: 36 },
    });
    const targetC = element({
      attribute: [TabNativeDragRegion.TARGET_ATTRIBUTE, "c"],
      rect: { left: 304, top: 8, right: 560, bottom: 36 },
    });
    const exclusionOffscreen = element({
      attribute: [TabNativeDragRegion.EXCLUSION_ATTRIBUTE, "offscreen"],
      rect: { left: 0, top: 0, right: 0, bottom: 0 },
      display: "block",
    });
    const exclusionA = element({
      attribute: [TabNativeDragRegion.EXCLUSION_ATTRIBUTE, "a"],
      rect: { left: 0, top: 0, right: 0, bottom: 0 },
      display: "none",
    });
    const exclusionB = element({
      attribute: [TabNativeDragRegion.EXCLUSION_ATTRIBUTE, "b"],
      rect: { left: 0, top: 0, right: 0, bottom: 0 },
      display: "none",
    });
    const exclusionC = element({
      attribute: [TabNativeDragRegion.EXCLUSION_ATTRIBUTE, "c"],
      rect: { left: 0, top: 0, right: 0, bottom: 0 },
      display: "none",
    });
    const viewport = container({ left: 100, top: 0, right: 500, bottom: 44 }, [
      targetOffscreen,
      targetA,
      targetB,
      targetC,
    ]);
    const layer = container({ left: 80, top: 0, right: 520, bottom: 44 }, [
      exclusionOffscreen,
      exclusionA,
      exclusionB,
      exclusionC,
    ]);

    new TabNativeDragRegion.Controller(
      viewport.element,
      layer.element
    ).reconcile();

    expect({
      display: exclusionA.style.display,
      left: exclusionA.style.left,
      top: exclusionA.style.top,
      width: exclusionA.style.width,
      height: exclusionA.style.height,
    }).toEqual({
      display: "block",
      left: "20px",
      top: "8px",
      width: "84px",
      height: "28px",
    });
    expect({
      display: exclusionB.style.display,
      left: exclusionB.style.left,
      width: exclusionB.style.width,
    }).toEqual({
      display: "block",
      left: "104px",
      width: "120px",
    });
    expect({
      display: exclusionC.style.display,
      left: exclusionC.style.left,
      width: exclusionC.style.width,
    }).toEqual({
      display: "block",
      left: "224px",
      width: "196px",
    });
    expect(exclusionOffscreen.style.display).toBe("none");
  });

  it("leaves space after the final tab in the native drag region", () => {
    const target = element({
      attribute: [TabNativeDragRegion.TARGET_ATTRIBUTE, "final"],
      rect: { left: 160, top: 8, right: 280, bottom: 36 },
    });
    const exclusion = element({
      attribute: [TabNativeDragRegion.EXCLUSION_ATTRIBUTE, "final"],
      rect: { left: 0, top: 0, right: 0, bottom: 0 },
      display: "none",
    });
    const viewport = container({ left: 100, top: 0, right: 500, bottom: 44 }, [
      target,
    ]);
    const layer = container({ left: 100, top: 0, right: 500, bottom: 44 }, [
      exclusion,
    ]);

    new TabNativeDragRegion.Controller(
      viewport.element,
      layer.element
    ).reconcile();

    expect({
      display: exclusion.style.display,
      left: exclusion.style.left,
      width: exclusion.style.width,
      height: exclusion.style.height,
    }).toEqual({
      display: "block",
      left: "60px",
      width: "120px",
      height: "28px",
    });
  });

  it("owns observation and scroll-listener cleanup", () => {
    const target = element({
      attribute: [TabNativeDragRegion.TARGET_ATTRIBUTE, "a"],
      rect: { left: 120, top: 10, right: 180, bottom: 34 },
    });
    const exclusion = element({
      attribute: [TabNativeDragRegion.EXCLUSION_ATTRIBUTE, "a"],
      rect: { left: 0, top: 0, right: 0, bottom: 0 },
      display: "none",
    });
    const viewport = container({ left: 100, top: 0, right: 500, bottom: 44 }, [
      target,
    ]);
    const layer = container({ left: 100, top: 0, right: 500, bottom: 44 }, [
      exclusion,
    ]);
    const observe = vi.fn<ResizeObserver["observe"]>();
    const disconnect = vi.fn<ResizeObserver["disconnect"]>();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = observe;
        disconnect = disconnect;
      }
    );
    const controller = new TabNativeDragRegion.Controller(
      viewport.element,
      layer.element
    );

    controller.connect();
    controller.connect();
    controller.dispose();

    expect(observe.mock.calls.map(([observed]) => observed)).toEqual([
      viewport.element,
      target,
    ]);
    expect(viewport.addEventListener).toHaveBeenCalledOnce();
    expect(viewport.addEventListener).toHaveBeenCalledWith(
      "scroll",
      controller.reconcile,
      { passive: true }
    );
    expect(viewport.removeEventListener).toHaveBeenCalledWith(
      "scroll",
      controller.reconcile
    );
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
