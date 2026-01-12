import type grida from "@grida/schema";
import kolor from "@grida/color";

import { css } from "./css";

describe("toReactTextStyle", () => {
  it("applies font feature and variation settings", () => {
    const style: grida.program.nodes.i.IComputedTextNodeStyle = {
      text_align: "left",
      text_align_vertical: "top",
      text_decoration_line: "none",
      font_family: "Inter",
      font_size: 16,
      font_weight: 400,
      font_kerning: true,
      fill: {
        type: "solid",
        color: kolor.colorformats.RGBA32F.BLACK,
        active: true,
      },
      font_features: { liga: false, smpl: true },
      font_variations: { wght: 700, slnt: 12 },
    };

    const result = css.toReactTextStyle(style);

    expect(result.fontFeatureSettings).toBe('"liga" off, "smpl" on, "kern" on');
    expect(result.fontVariationSettings).toBe('"slnt" 12');
  });

  it("handles font optical sizing", () => {
    const style: grida.program.nodes.i.IComputedTextNodeStyle = {
      text_align: "left",
      text_align_vertical: "top",
      text_decoration_line: "none",
      font_family: "Inter",
      font_size: 16,
      font_weight: 400,
      font_kerning: true,
      fill: {
        type: "solid",
        color: kolor.colorformats.RGBA32F.BLACK,
        active: true,
      },
      font_optical_sizing: 12,
      font_variations: { wght: 500 },
    };

    const result = css.toReactTextStyle(style);

    expect(result.fontOpticalSizing).toBe("none");
    expect(result.fontVariationSettings).toBe('"opsz" 12');
  });

  it("overrides kern feature with fontKerning", () => {
    const style: grida.program.nodes.i.IComputedTextNodeStyle = {
      text_align: "left",
      text_align_vertical: "top",
      text_decoration_line: "none",
      font_family: "Inter",
      font_size: 16,
      font_weight: 400,
      font_kerning: false,
      fill: {
        type: "solid",
        color: kolor.colorformats.RGBA32F.BLACK,
        active: true,
      },
      font_features: { kern: true },
    };

    const result = css.toReactTextStyle(style);

    expect(result.fontFeatureSettings).toBe('"kern" off');
  });

  it("overrides wdth variation with fontWidth", () => {
    const style: grida.program.nodes.i.IComputedTextNodeStyle = {
      text_align: "left",
      text_align_vertical: "top",
      text_decoration_line: "none",
      font_family: "Inter",
      font_size: 16,
      font_weight: 400,
      font_kerning: true,
      font_width: 150,
      fill: {
        type: "solid",
        color: kolor.colorformats.RGBA32F.BLACK,
        active: true,
      },
      font_variations: { wdth: 120, wght: 500 },
    };

    const result = css.toReactTextStyle(style);

    expect(result.fontVariationSettings).toBe('"wdth" 150');
  });

  it("maps textTransform to CSS property", () => {
    const style: grida.program.nodes.i.IComputedTextNodeStyle = {
      text_align: "left",
      text_align_vertical: "top",
      text_decoration_line: "none",
      font_family: "Inter",
      font_size: 16,
      font_weight: 400,
      font_kerning: true,
      fill: {
        type: "solid",
        color: kolor.colorformats.RGBA32F.BLACK,
        active: true,
      },
      text_transform: "uppercase",
    };

    const result = css.toReactTextStyle(style);

    expect(result.textTransform).toBe("uppercase");
  });
});

describe("toReactCSSProperties", () => {
  it("applies maxLines with line clamp styles", () => {
    const result = css.toReactCSSProperties(
      {
        text_align: "left",
        text_align_vertical: "top",
        text_decoration_line: "none",
        font_family: "Inter",
        font_size: 16,
        font_weight: 400,
        fill: {
          type: "solid",
          color: kolor.colorformats.RGBA32F.BLACK,
          active: true,
        },
        max_lines: 2,
      },
      {
        hasTextStyle: true,
        fill: "color",
      }
    );

    expect(result.display).toBe("-webkit-box");
    expect(result.WebkitLineClamp).toBe(2);
    expect(result.WebkitBoxOrient).toBe("vertical");
    expect(result.overflow).toBe("hidden");
  });
});
