import { describe, expect, it } from "vitest";
import { CoverFlowCarousel } from "./cover-flow-carousel";

const viewport = { width: 1440, height: 900 };
const count = 9;

function bounds(
  layout: ReturnType<typeof CoverFlowCarousel.layout>,
  index: number
) {
  const item = layout.items[index];
  const center = layout.x + item.x + 200;
  const halfWidth = (layout.artworkWidth * item.scale) / 2;
  return { left: center - halfWidth, right: center + halfWidth };
}

describe("CoverFlowCarousel.layout", () => {
  it("returns the same immediate layout when revisiting a scroll position", () => {
    const input = { count, focus: 2.4, ...viewport };
    const before = CoverFlowCarousel.layout(input);

    for (const focus of [7, 0, 4.5, 1]) {
      CoverFlowCarousel.layout({ ...input, focus });
    }

    expect(CoverFlowCarousel.layout(input)).toEqual(before);
  });

  it.each([1280, 1440, 1920])(
    "keeps focused endpoints inside the centered content range at %ipx",
    (width) => {
      const first = CoverFlowCarousel.layout({
        count,
        focus: 0,
        width,
        height: 900,
      });
      const last = CoverFlowCarousel.layout({
        count,
        focus: count - 1,
        width,
        height: 900,
      });

      const inset = (width - Math.min(1120, width * 0.8)) / 2;
      expect(bounds(first, 0).left).toBeCloseTo(inset);
      expect(bounds(last, count - 1).right).toBeCloseTo(width - inset);
    }
  );

  it("gives every model a full portrait focus with a visible caption and softer corners", () => {
    for (let focus = 0; focus < count; focus++) {
      const layout = CoverFlowCarousel.layout({ count, focus, ...viewport });
      const featured = layout.items[focus];

      expect(layout.items).toHaveLength(count);
      expect(layout.artworkHeight).toBeGreaterThan(layout.artworkWidth);
      expect(featured.captionOpacity).toBe(1);
      expect(bounds(layout, focus).left).toBeGreaterThanOrEqual(0);
      expect(bounds(layout, focus).right).toBeLessThanOrEqual(viewport.width);
      for (const [index, item] of layout.items.entries()) {
        if (index === focus) continue;
        expect(item.scale).toBeLessThan(featured.scale);
        expect(item.radius).toBeLessThan(featured.radius);
        expect(item.captionOpacity).toBe(0);
      }
    }
  });

  it("preserves space between artwork while moving left through fractional focus positions", () => {
    let previousX = Infinity;
    for (let step = 0; step <= (count - 1) * 20; step++) {
      const layout = CoverFlowCarousel.layout({
        count,
        focus: step / 20,
        ...viewport,
      });

      expect(layout.x).toBeLessThanOrEqual(previousX);
      previousX = layout.x;
      for (let index = 1; index < count; index++) {
        expect(bounds(layout, index).left).toBeGreaterThan(
          bounds(layout, index - 1).right
        );
      }
    }
  });

  it("fits artwork to the available height immediately after resizing", () => {
    const short = CoverFlowCarousel.layout({
      count,
      focus: 3,
      width: 1280,
      height: 700,
    });
    const tall = CoverFlowCarousel.layout({
      count,
      focus: 3,
      width: 1920,
      height: 1080,
    });

    expect(short.artworkHeight).toBeGreaterThan(0);
    expect(short.artworkHeight).toBeLessThan(tall.artworkHeight);
    expect(short.artworkWidth / short.artworkHeight).toBeCloseTo(
      tall.artworkWidth / tall.artworkHeight
    );
    expect(bounds(short, 3).left).toBeGreaterThanOrEqual(0);
    expect(bounds(short, 3).right).toBeLessThanOrEqual(1280);
    expect(bounds(tall, 3).left).toBeGreaterThanOrEqual(0);
    expect(bounds(tall, 3).right).toBeLessThanOrEqual(1920);
  });

  it.each([0, 1])("handles %i model without invalid geometry", (count) => {
    const layout = CoverFlowCarousel.layout({ count, focus: 0, ...viewport });

    expect(layout.items).toHaveLength(count);
    const values = [
      layout.x,
      layout.artworkWidth,
      layout.artworkHeight,
      ...layout.items.flatMap((item) => [
        item.x,
        item.scale,
        item.radius,
        item.captionOpacity,
      ]),
    ];
    expect(values.every(Number.isFinite)).toBe(true);
  });
});

describe("CoverFlowCarousel.focusAtScroll", () => {
  it("maps forward, backward, and large scroll jumps directly to the current model", () => {
    const positions = [1000, 2200, 3400, 1600, 1900];
    const focus = positions.map((scrollY) =>
      CoverFlowCarousel.focusAtScroll(scrollY, 1000, 3400, count)
    );

    expect(focus).toEqual([0, 4, 8, 2, 3]);
    expect(CoverFlowCarousel.focusAtScroll(1750, 1000, 3400, count)).toBe(2.5);
  });

  it("holds the endpoint artwork outside the gallery scroll interval", () => {
    expect(CoverFlowCarousel.focusAtScroll(0, 1000, 3400, count)).toBe(0);
    expect(CoverFlowCarousel.focusAtScroll(5000, 1000, 3400, count)).toBe(8);
  });

  it.each([0, 1])("keeps focus at zero for %i model", (count) => {
    expect(CoverFlowCarousel.focusAtScroll(1800, 1000, 3400, count)).toBe(0);
  });
});

describe("CoverFlowCarousel.meshRevealAtFocus", () => {
  it("keeps the textured scene before arrival and fully reveals geometry at focus", () => {
    expect(CoverFlowCarousel.meshRevealAtFocus(0, 8)).toBe(0);
    expect(CoverFlowCarousel.meshRevealAtFocus(7, 8)).toBe(0);
    expect(CoverFlowCarousel.meshRevealAtFocus(8, 8)).toBe(1);
    expect(CoverFlowCarousel.meshRevealAtFocus(9, 8)).toBe(1);
  });

  it("advances continuously and retraces exactly without remembered animation state", () => {
    const focuses = Array.from({ length: 21 }, (_, i) => 7.1 + (i / 20) * 0.9);
    const forward = focuses.map((focus) =>
      CoverFlowCarousel.meshRevealAtFocus(focus, 8)
    );
    const backward = [...focuses]
      .reverse()
      .map((focus) => CoverFlowCarousel.meshRevealAtFocus(focus, 8));

    expect(backward.reverse()).toEqual(forward);
    expect(forward[0]).toBeCloseTo(0);
    expect(forward.at(-1)).toBe(1);
    for (let i = 1; i < forward.length; i++) {
      expect(forward[i]).toBeGreaterThanOrEqual(forward[i - 1]);
      expect(forward[i] - forward[i - 1]).toBeLessThan(0.08);
    }
  });

  it("can reveal the first exhibit while leaving its initial focus", () => {
    expect(CoverFlowCarousel.meshRevealAtFocus(0, 0)).toBe(0);
    expect(CoverFlowCarousel.meshRevealAtFocus(0.45, 0)).toBeCloseTo(0.5);
    expect(CoverFlowCarousel.meshRevealAtFocus(0.9, 0)).toBe(1);
  });

  it("follows the mesh exhibit index if the gallery is reordered", () => {
    expect(CoverFlowCarousel.meshRevealAtFocus(2.55, 3)).toBeCloseTo(0.5);
    expect(CoverFlowCarousel.meshRevealAtFocus(7.55, 8)).toBeCloseTo(0.5);
  });
});
