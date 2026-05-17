import { describe, expect, it } from "vitest";
import { filterHUDDrawByGroup, type HUDDraw } from "../primitives";

const GROUP = {
  sizeMeter: "test.size-meter",
  snap: "test.snap",
  selection: "test.selection",
} as const;

describe("HUD semantic groups", () => {
  it("filters primitives by group while preserving unrelated extras", () => {
    const draw: HUDDraw = {
      lines: [
        {
          x1: 0,
          y1: 0,
          x2: 10,
          y2: 0,
          group: GROUP.sizeMeter,
        },
        {
          x1: 0,
          y1: 10,
          x2: 10,
          y2: 10,
          group: GROUP.snap,
        },
        { x1: 0, y1: 20, x2: 10, y2: 20 },
      ],
      rects: [
        {
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          group: GROUP.selection,
        },
      ],
    };

    const filtered = filterHUDDrawByGroup(draw, {
      hidden: [GROUP.selection, GROUP.sizeMeter],
    });

    expect(filtered?.rects).toBeUndefined();
    expect(filtered?.lines).toHaveLength(2);
    expect(filtered?.lines?.[0].group).toBe(GROUP.snap);
    expect(filtered?.lines?.[1].group).toBeUndefined();
  });

  it("returns undefined when every primitive is hidden", () => {
    const draw: HUDDraw = {
      rects: [
        {
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          group: GROUP.selection,
        },
      ],
    };

    expect(
      filterHUDDrawByGroup(draw, {
        hidden: [GROUP.selection],
      })
    ).toBeUndefined();
  });
});
