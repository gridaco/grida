import { describe, expect, it } from "vitest";
import { ImageCamera } from "./image-camera";

const geometry = {
  containerWidth: 1000,
  containerHeight: 700,
  naturalWidth: 96,
  naturalHeight: 64,
};

describe("ImageCamera", () => {
  it("fits without upscaling a small image", () => {
    const camera = ImageCamera.fit(geometry);

    expect(camera.scale).toBe(1);
    expect(camera.x).toBe(452);
    expect(camera.y).toBe(318);
    expect(camera.pannable).toBe(false);
    expect(camera.transform).toBe("translate(452px, 318px) scale(1)");
  });

  it("re-clamps around resized container geometry", () => {
    const resized = ImageCamera.fit(geometry).resize({
      ...geometry,
      containerWidth: 500,
      containerHeight: 400,
    });

    expect(resized.scale).toBe(1);
    expect(resized.x).toBe(202);
    expect(resized.y).toBe(168);
  });

  it("zooms at a fixed point and pans only within the legal range", () => {
    const zoomed = ImageCamera.fit(geometry).zoomAt(16, 500, 350);
    const panned = zoomed.panBy(90, 60);

    expect(zoomed.scale).toBe(16);
    expect(zoomed.x).toBe(-268);
    expect(zoomed.y).toBe(-162);
    expect(zoomed.pannable).toBe(true);
    expect(panned.x).toBe(-178);
    expect(panned.y).toBe(-102);
  });

  it("toggles a magnified camera back to fit", () => {
    const fitted = ImageCamera.fit(geometry);
    const zoomed = fitted.toggleZoomAt(500, 350);

    expect(zoomed.scale).toBe(2);
    expect(zoomed.toggleZoomAt(500, 350)).toEqual(fitted);
  });
});
