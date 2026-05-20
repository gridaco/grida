import { describe, expect, it } from "vitest";
import { SurfaceState } from "../event/state";
import { buildChrome } from "../surface/chrome";
import { DEFAULT_STYLE } from "../surface/style";

const RECT = { x: 0, y: 0, width: 100, height: 100 };

describe("surface chrome semantic groups", () => {
  it("does not stamp groups unless the host provides them", () => {
    const state = new SurfaceState();
    state.setSelection(["a"]);

    const chrome = buildChrome({
      state,
      shapeOf: (id) => (id === "a" ? { kind: "rect", rect: RECT } : null),
      style: DEFAULT_STYLE,
      width: 1000,
      height: 1000,
    });

    expect(chrome.decoration.rects?.[0].group).toBeUndefined();
    expect(chrome.overlays.some((overlay) => overlay.group)).toBe(false);
  });

  it("stamps host-provided group strings onto the matching chrome slots", () => {
    const state = new SurfaceState();
    state.setSelection(["a"]);

    const chrome = buildChrome({
      state,
      shapeOf: (id) => (id === "a" ? { kind: "rect", rect: RECT } : null),
      style: DEFAULT_STYLE,
      groups: {
        selection: "host.selection",
        selectionControls: "host.selection-controls",
      },
      width: 1000,
      height: 1000,
    });

    expect(chrome.decoration.rects?.[0].group).toBe("host.selection");
    expect(chrome.overlays).not.toHaveLength(0);
    expect(
      chrome.overlays.every(
        (overlay) => overlay.group === "host.selection-controls"
      )
    ).toBe(true);
  });
});
