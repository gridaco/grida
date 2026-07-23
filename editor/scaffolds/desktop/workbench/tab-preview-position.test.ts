import { describe, expect, it } from "vitest";
import { TabPreviewPosition } from "./tab-preview-position";

describe("TabPreviewPosition.visibleAnchor", () => {
  it("clips a partially scrolled tab and rejects an offscreen one", () => {
    const clip = { left: 20, top: 0, right: 200, bottom: 44 };

    expect(
      TabPreviewPosition.visibleAnchor(
        { left: 0, top: 10, right: 80, bottom: 34 },
        clip
      )
    ).toEqual({ left: 20, top: 10, right: 80, bottom: 34 });
    expect(
      TabPreviewPosition.visibleAnchor(
        { left: -80, top: 10, right: 0, bottom: 34 },
        clip
      )
    ).toBeNull();
  });
});

describe("TabPreviewPosition.place", () => {
  const viewport = { width: 800, height: 600 };
  const popup = { width: 256, height: 190 };

  it("places below the tab and clamps against horizontal viewport edges", () => {
    expect(
      TabPreviewPosition.place({
        anchor: { left: 700, top: 10, right: 780, bottom: 34 },
        popup,
        viewport,
      })
    ).toEqual({ left: 532, top: 40 });
  });

  it("flips above when the preview does not fit below", () => {
    expect(
      TabPreviewPosition.place({
        anchor: { left: 100, top: 560, right: 180, bottom: 584 },
        popup,
        viewport,
      })
    ).toEqual({ left: 100, top: 364 });
  });
});
