import { describe, expect, it } from "vitest";
import type { LibraryExplorerItem } from "./library-explorer";
import { MasonryScroll, type MasonryScrollPositioner } from "./masonry-scroll";

const items: LibraryExplorerItem[] = ["a", "b", "c"].map((id) => ({
  id,
  title: id,
  url: `https://example.com/${id}.png`,
  width: 100,
  height: 100,
  mime: "image/png",
}));

function positioner(tops: number[]): MasonryScrollPositioner {
  return {
    get: (index) =>
      tops[index] === undefined ? undefined : { top: tops[index] },
    range: (lo, hi, callback) => {
      tops.forEach((top, index) => {
        if (top <= hi && top + 280 >= lo) callback(index, 0, top);
      });
    },
  };
}

describe("MasonryScroll", () => {
  it("captures the nearest visible item as a responsive anchor", () => {
    expect(
      MasonryScroll.capture(items, positioner([0, 320, 640]), 500, 100, 500)
    ).toEqual({
      scrollTop: 500,
      anchorId: "b",
      anchorOffset: -80,
    });
  });

  it("resolves a moved anchor and preserves its viewport offset", () => {
    expect(
      MasonryScroll.resolve(
        items,
        positioner([0, 440, 880]),
        {
          scrollTop: 500,
          anchorId: "b",
          anchorOffset: -80,
        },
        100
      )
    ).toBe(620);
  });

  it("falls back to the raw scroll position when the anchor is gone", () => {
    expect(
      MasonryScroll.resolve(
        items.slice(1),
        positioner([0, 440]),
        {
          scrollTop: 500,
          anchorId: "a",
          anchorOffset: -80,
        },
        100
      )
    ).toBe(500);
  });
});
