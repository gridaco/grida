import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LibraryFocusFeedback } from "./library-focus-feedback";

describe("LibraryFocusFeedback", () => {
  let frames: FrameRequestCallback[];

  beforeEach(() => {
    frames = [];
    vi.stubGlobal(
      "requestAnimationFrame",
      (callback: FrameRequestCallback): number => {
        frames.push(callback);
        return frames.length;
      }
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("restores card focus without running visual feedback", () => {
    const focus = vi.fn<(options?: FocusOptions) => void>();
    const animate = vi.fn<HTMLElement["animate"]>();
    const card = {
      isConnected: true,
      querySelector: () => ({ focus }),
      animate,
    } as unknown as HTMLElement;
    const feedback = new LibraryFocusFeedback();
    feedback.ref("reference-1")(card);

    feedback.focus("reference-1");
    frames.shift()?.(0);

    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(animate).not.toHaveBeenCalled();
    feedback.dispose();
  });

  it("waits for a virtualized card, then focuses and flashes it", () => {
    const focus = vi.fn<(options?: FocusOptions) => void>();
    const motionAnimation = {
      cancel: vi.fn<Animation["cancel"]>(),
      onfinish: null,
      oncancel: null,
    } as unknown as Animation;
    const ringAnimation = {
      cancel: vi.fn<Animation["cancel"]>(),
      onfinish: null,
      oncancel: null,
    } as unknown as Animation;
    const animate = vi.fn<HTMLElement["animate"]>(() => motionAnimation);
    const ringAnimate = vi.fn<HTMLElement["animate"]>(() => ringAnimation);
    const remove = vi.fn<HTMLElement["remove"]>();
    const ring = {
      style: {},
      animate: ringAnimate,
      remove,
    } as unknown as HTMLElement;
    const append = vi.fn<HTMLElement["append"]>();
    const card = {
      isConnected: true,
      querySelector: () => ({ focus }),
      animate,
      append,
    } as unknown as HTMLElement;
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: false }),
    });
    vi.stubGlobal("document", {
      createElement: () => ring,
    });
    const feedback = new LibraryFocusFeedback();

    feedback.flash("reference-1", { focus: true });
    frames.shift()?.(0);
    expect(animate).not.toHaveBeenCalled();

    feedback.ref("reference-1")(card);
    frames.shift()?.(0);

    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(append).toHaveBeenCalledWith(ring);
    expect(animate).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        delay: LibraryFocusFeedback.settleDelayMs,
        duration: LibraryFocusFeedback.animationMs,
      })
    );
    expect(ringAnimate).toHaveBeenCalledOnce();

    feedback.dispose();
    expect(motionAnimation.cancel).toHaveBeenCalledOnce();
    expect(ringAnimation.cancel).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalled();
  });
});
