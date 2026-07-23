import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TAB_PREVIEW_CLOSE_DELAY_MS,
  TAB_PREVIEW_OPEN_DELAY_MS,
  TabPreviewController,
  type TabPreviewSnapshot,
} from "./tab-preview-controller";

function anchor(name: string): HTMLElement {
  return { dataset: { name } } as unknown as HTMLElement;
}

function expectOpen(
  snapshot: TabPreviewSnapshot,
  relPath: string,
  element: HTMLElement
): void {
  expect(snapshot.open).toBe(true);
  if (!snapshot.open) return;
  expect(snapshot.relPath).toBe(relPath);
  expect(snapshot.anchor).toBe(element);
}

describe("TabPreviewController", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("opens a cold pointer target after 500 ms with a stable external-store snapshot", () => {
    const controller = new TabPreviewController();
    const tab = anchor("a");
    const closed = controller.getSnapshot();
    const listener = vi.fn<() => void>();
    controller.subscribe(listener);

    controller.pointerEnter({ relPath: "a.svg", anchor: tab }, "mouse");
    expect(controller.getSnapshot()).toBe(closed);
    vi.advanceTimersByTime(TAB_PREVIEW_OPEN_DELAY_MS - 1);
    expect(controller.getSnapshot()).toBe(closed);
    expect(listener).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expectOpen(controller.getSnapshot(), "a.svg", tab);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(controller.matchesChangedPath("a.svg")).toBe(true);
    expect(controller.matchesChangedPath("a.svg/assets/cover.png")).toBe(true);
    expect(controller.matchesChangedPath("b.svg")).toBe(false);
  });

  it("cancels a cold target that leaves before its delay elapses", () => {
    const controller = new TabPreviewController();
    const tab = anchor("a");

    controller.pointerEnter({ relPath: "a.svg", anchor: tab }, "mouse");
    vi.advanceTimersByTime(TAB_PREVIEW_OPEN_DELAY_MS / 2);
    controller.pointerLeave("a.svg", "mouse");
    vi.advanceTimersByTime(TAB_PREVIEW_OPEN_DELAY_MS);

    expect(controller.getSnapshot().open).toBe(false);
  });

  it("bridges a tab gap and switches to a sibling immediately once warm", () => {
    const controller = new TabPreviewController();
    const a = anchor("a");
    const b = anchor("b");

    controller.pointerEnter({ relPath: "a.svg", anchor: a }, "mouse");
    vi.advanceTimersByTime(TAB_PREVIEW_OPEN_DELAY_MS);
    controller.pointerLeave("a.svg", "mouse");
    vi.advanceTimersByTime(TAB_PREVIEW_CLOSE_DELAY_MS - 1);
    expectOpen(controller.getSnapshot(), "a.svg", a);

    controller.pointerEnter({ relPath: "b.svg", anchor: b }, "mouse");
    expectOpen(controller.getSnapshot(), "b.svg", b);
    vi.advanceTimersByTime(TAB_PREVIEW_CLOSE_DELAY_MS);
    expectOpen(controller.getSnapshot(), "b.svg", b);

    // Warmth belongs to the whole pointer pass, not only the visible bridge.
    controller.pointerLeave("b.svg", "mouse");
    vi.advanceTimersByTime(TAB_PREVIEW_CLOSE_DELAY_MS);
    expect(controller.getSnapshot().open).toBe(false);
    controller.pointerEnter({ relPath: "a.svg", anchor: a }, "mouse");
    expectOpen(controller.getSnapshot(), "a.svg", a);
  });

  it("keeps a rail-edge re-entry warm, then resets after the bridge closes", () => {
    const controller = new TabPreviewController();
    const a = anchor("a");
    const b = anchor("b");

    controller.pointerEnter({ relPath: "a.svg", anchor: a }, "mouse");
    vi.advanceTimersByTime(TAB_PREVIEW_OPEN_DELAY_MS);
    controller.railLeave("mouse");
    vi.advanceTimersByTime(TAB_PREVIEW_CLOSE_DELAY_MS / 2);
    expectOpen(controller.getSnapshot(), "a.svg", a);

    controller.pointerEnter({ relPath: "b.svg", anchor: b }, "mouse");
    expectOpen(controller.getSnapshot(), "b.svg", b);

    controller.railLeave("mouse");
    vi.advanceTimersByTime(TAB_PREVIEW_CLOSE_DELAY_MS);
    expect(controller.getSnapshot().open).toBe(false);
    controller.pointerEnter({ relPath: "a.svg", anchor: a }, "mouse");
    vi.advanceTimersByTime(TAB_PREVIEW_OPEN_DELAY_MS - 1);
    expect(controller.getSnapshot().open).toBe(false);
    vi.advanceTimersByTime(1);
    expectOpen(controller.getSnapshot(), "a.svg", a);
  });

  it("ignores touch without disturbing an existing pointer preview", () => {
    const controller = new TabPreviewController();
    const a = anchor("a");
    const b = anchor("b");

    controller.pointerEnter({ relPath: "a.svg", anchor: a }, "touch");
    vi.advanceTimersByTime(TAB_PREVIEW_OPEN_DELAY_MS);
    expect(controller.getSnapshot().open).toBe(false);

    controller.pointerEnter({ relPath: "a.svg", anchor: a }, "mouse");
    vi.advanceTimersByTime(TAB_PREVIEW_OPEN_DELAY_MS);
    controller.pointerLeave("a.svg", "touch");
    controller.railLeave("touch");
    vi.advanceTimersByTime(TAB_PREVIEW_CLOSE_DELAY_MS);
    expectOpen(controller.getSnapshot(), "a.svg", a);

    controller.pointerEnter({ relPath: "b.svg", anchor: b }, "touch");
    expectOpen(controller.getSnapshot(), "a.svg", a);
  });

  it("dismisses pending/open work and reconciles targets removed from the rail", () => {
    const controller = new TabPreviewController();
    const a = anchor("a");
    const b = anchor("b");

    controller.pointerEnter({ relPath: "a.svg", anchor: a }, "mouse");
    controller.dismiss();
    vi.advanceTimersByTime(TAB_PREVIEW_OPEN_DELAY_MS);
    expect(controller.getSnapshot().open).toBe(false);

    controller.pointerEnter({ relPath: "a.svg", anchor: a }, "mouse");
    controller.reconcile(["b.svg"]);
    vi.advanceTimersByTime(TAB_PREVIEW_OPEN_DELAY_MS);
    expect(controller.getSnapshot().open).toBe(false);

    controller.pointerEnter({ relPath: "a.svg", anchor: a }, "mouse");
    vi.advanceTimersByTime(TAB_PREVIEW_OPEN_DELAY_MS);
    controller.reconcile(["b.svg"]);
    expect(controller.getSnapshot().open).toBe(false);

    controller.pointerEnter({ relPath: "b.svg", anchor: b }, "mouse");
    expectOpen(controller.getSnapshot(), "b.svg", b);
    controller.reconcile(["b.svg"]);
    expectOpen(controller.getSnapshot(), "b.svg", b);
  });

  it("dispose cancels timers, clears listeners, and makes later calls inert", () => {
    const controller = new TabPreviewController();
    const tab = anchor("a");
    const listener = vi.fn<() => void>();
    controller.subscribe(listener);

    controller.pointerEnter({ relPath: "a.svg", anchor: tab }, "mouse");
    controller.dispose();
    vi.advanceTimersByTime(TAB_PREVIEW_OPEN_DELAY_MS);
    expect(controller.getSnapshot().open).toBe(false);
    expect(listener).not.toHaveBeenCalled();

    controller.pointerEnter({ relPath: "a.svg", anchor: tab }, "mouse");
    vi.advanceTimersByTime(TAB_PREVIEW_OPEN_DELAY_MS);
    controller.reconcile(["a.svg"]);
    controller.dismiss();
    expect(controller.getSnapshot().open).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });
});
