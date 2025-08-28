import type grida from "@grida/schema";

jest.mock(
  "@grida/cmath",
  () => ({ __esModule: true, default: {} }),
  { virtual: true }
);
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
      fontFeatures: { liga: false, smcp: true },
      fontVariations: { wght: 700, slnt: 12 },
    };

    const result = css.toReactTextStyle(style);

    expect(result.fontFeatureSettings).toBe('"liga" off, "smcp" on');
    expect(result.fontVariationSettings).toBe('"wght" 700, "slnt" 12');
  });
});
