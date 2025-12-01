import type grida from "@grida/schema";
import cmath from "@grida/cmath";

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
      fontKerning: true,
      fill: {
        type: "solid",
        color: cmath.colorformats.RGB888A32F.BLACK,
        active: true,
      },
      fontFeatures: { liga: false, smpl: true },
      fontVariations: { wght: 700, slnt: 12 },
    };

    const result = css.toReactTextStyle(style);

    expect(result.fontFeatureSettings).toBe('"liga" off, "smpl" on, "kern" on');
    expect(result.fontVariationSettings).toBe('"slnt" 12');
  });

  it("handles font optical sizing", () => {
    const style: grida.program.nodes.i.IComputedTextNodeStyle = {
      textAlign: "left",
      textAlignVertical: "top",
      textDecorationLine: "none",
      fontFamily: "Inter",
      fontSize: 16,
      fontWeight: 400,
      fontKerning: true,
      fill: {
        type: "solid",
        color: cmath.colorformats.RGB888A32F.BLACK,
        active: true,
      },
      fontOpticalSizing: 12,
      fontVariations: { wght: 500 },
    };

    const result = css.toReactTextStyle(style);

    expect(result.fontOpticalSizing).toBe("none");
    expect(result.fontVariationSettings).toBe('"opsz" 12');
  });

  it("overrides kern feature with fontKerning", () => {
    const style: grida.program.nodes.i.IComputedTextNodeStyle = {
      textAlign: "left",
      textAlignVertical: "top",
      textDecorationLine: "none",
      fontFamily: "Inter",
      fontSize: 16,
      fontWeight: 400,
      fontKerning: false,
      fill: {
        type: "solid",
        color: cmath.colorformats.RGB888A32F.BLACK,
        active: true,
      },
      fontFeatures: { kern: true },
    };

    const result = css.toReactTextStyle(style);

    expect(result.fontFeatureSettings).toBe('"kern" off');
  });

  it("overrides wdth variation with fontWidth", () => {
    const style: grida.program.nodes.i.IComputedTextNodeStyle = {
      textAlign: "left",
      textAlignVertical: "top",
      textDecorationLine: "none",
      fontFamily: "Inter",
      fontSize: 16,
      fontWeight: 400,
      fontKerning: true,
      fontWidth: 150,
      fill: {
        type: "solid",
        color: cmath.colorformats.RGB888A32F.BLACK,
        active: true,
      },
      fontVariations: { wdth: 120, wght: 500 },
    };

    const result = css.toReactTextStyle(style);

    expect(result.fontVariationSettings).toBe('"wdth" 150');
  });

  it("maps textTransform to CSS property", () => {
    const style: grida.program.nodes.i.IComputedTextNodeStyle = {
      textAlign: "left",
      textAlignVertical: "top",
      textDecorationLine: "none",
      fontFamily: "Inter",
      fontSize: 16,
      fontWeight: 400,
      fontKerning: true,
      fill: {
        type: "solid",
        color: cmath.colorformats.RGB888A32F.BLACK,
        active: true,
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
      fill: {
        type: "solid",
        color: cmath.colorformats.RGB888A32F.BLACK,
        active: true,
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
