import type grida from "@grida/schema";

jest.mock("@grida/cmath", () => ({ __esModule: true, default: {} }), {
  virtual: true,
});
jest.mock("color-name", () => ({}), { virtual: true });

import { css } from "./css";

describe("toReactTextStyle", () => {
  it("applies font feature and variation settings", () => {
    const style: grida.program.nodes.i.IComputedTextNodeStyle = {
      textAlign: "left",
      textAlignVertical: "top",
      textDecorationLine: "none",
      fontFamily: "Inter",
      fontSize: 16,
      fontWeight: 400,
      letterSpacing: 0,
      lineHeight: 16,
      fill: {
        type: "solid",
        color: { r: 0, g: 0, b: 0, a: 1 },
      },
      fontFeatures: { liga: false, smpl: true },
      fontVariations: { wght: 700, slnt: 12 },
    };

    const result = css.toReactTextStyle(style);

    expect(result.fontFeatureSettings).toBe('"liga" off, "smpl" on');
    expect(result.fontVariationSettings).toBe('"wght" 700, "slnt" 12');
  });

  it("maps textTransform to CSS property", () => {
    const style: grida.program.nodes.i.IComputedTextNodeStyle = {
      textAlign: "left",
      textAlignVertical: "top",
      textDecorationLine: "none",
      fontFamily: "Inter",
      fontSize: 16,
      fontWeight: 400,
      letterSpacing: 0,
      lineHeight: 16,
      fill: {
        type: "solid",
        color: { r: 0, g: 0, b: 0, a: 1 },
      },
      textTransform: "uppercase",
    };

    const result = css.toReactTextStyle(style);

    expect(result.textTransform).toBe("uppercase");
  });
});

describe("toReactCSSProperties", () => {
  it("applies maxLines with line clamp styles", () => {
    const styles = {
      textAlign: "left",
      textAlignVertical: "top",
      textDecorationLine: "none",
      fontFamily: "Inter",
      fontSize: 16,
      fontWeight: 400,
      letterSpacing: 0,
      lineHeight: 16,
      fill: {
        type: "solid",
        color: { r: 0, g: 0, b: 0, a: 1 },
      },
      maxLines: 2,
    } as any;

    const result = css.toReactCSSProperties(styles, {
      hasTextStyle: true,
      fill: "color",
    });

    expect(result.display).toBe("-webkit-box");
    expect((result as any).WebkitLineClamp).toBe(2);
    expect((result as any).WebkitBoxOrient).toBe("vertical");
    expect(result.overflow).toBe("hidden");
  });
});
