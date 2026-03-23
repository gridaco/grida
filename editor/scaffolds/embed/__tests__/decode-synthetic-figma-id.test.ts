import { decodeSyntheticFigmaId } from "../use-refig-editor";

describe("decodeSyntheticFigmaId", () => {
  test("preserves plain Figma IDs unchanged", () => {
    expect(decodeSyntheticFigmaId("1:2")).toBe("1:2");
    expect(decodeSyntheticFigmaId("42:17")).toBe("42:17");
    expect(decodeSyntheticFigmaId("0:0")).toBe("0:0");
    expect(decodeSyntheticFigmaId("1038:24")).toBe("1038:24");
  });

  test("preserves Figma instance IDs unchanged", () => {
    // Instance IDs use I-prefix and semicolons
    expect(decodeSyntheticFigmaId("I1620:1441;291:113")).toBe(
      "I1620:1441;291:113"
    );
    expect(decodeSyntheticFigmaId("I100:200;300:400")).toBe("I100:200;300:400");
  });

  test("strips _fill_{N} suffix → parent Figma ID", () => {
    expect(decodeSyntheticFigmaId("42:17_fill_0")).toBe("42:17");
    expect(decodeSyntheticFigmaId("42:17_fill_1")).toBe("42:17");
    expect(decodeSyntheticFigmaId("1:2_fill_99")).toBe("1:2");
  });

  test("strips _stroke_{N} suffix → parent Figma ID", () => {
    expect(decodeSyntheticFigmaId("42:17_stroke_0")).toBe("42:17");
    expect(decodeSyntheticFigmaId("42:17_stroke_3")).toBe("42:17");
  });

  test("strips synthetic suffix from instance IDs", () => {
    expect(decodeSyntheticFigmaId("I1620:1441;291:113_fill_0")).toBe(
      "I1620:1441;291:113"
    );
    expect(decodeSyntheticFigmaId("I100:200;300:400_stroke_1")).toBe(
      "I100:200;300:400"
    );
  });

  test("decodes instance-clone IDs → original Figma ID", () => {
    // Format: {prefix}::{counter}::{originalId}
    expect(decodeSyntheticFigmaId("42:17::0::5:3")).toBe("5:3");
    expect(decodeSyntheticFigmaId("42:17::1::10:20")).toBe("10:20");
  });

  test("decodes instance-clone + synthetic suffix → original Figma ID", () => {
    expect(decodeSyntheticFigmaId("42:17::0::5:3_fill_0")).toBe("5:3");
    expect(decodeSyntheticFigmaId("42:17::1::10:20_stroke_1")).toBe("10:20");
  });

  test("preserves non-Figma IDs unchanged (scene IDs, etc.)", () => {
    expect(decodeSyntheticFigmaId("scene-1")).toBe("scene-1");
    expect(decodeSyntheticFigmaId("scene-0")).toBe("scene-0");
  });
});
