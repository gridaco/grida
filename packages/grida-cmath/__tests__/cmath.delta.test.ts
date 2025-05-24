import cmath from "..";

describe("cmath.delta.transform", () => {
  it("identity", () => {
    const I = [
      [1, 0, 0],
      [0, 1, 0],
    ] as cmath.Transform;
    expect(cmath.delta.transform(5, "x", I)).toBe(5);
    expect(cmath.delta.transform(7, "y", I)).toBe(7);
  });

  it("translation", () => {
    const T = [
      [1, 0, 10],
      [0, 1, 20],
    ] as cmath.Transform;
    expect(cmath.delta.transform(5, "x", T)).toBe(15);
    expect(cmath.delta.transform(7, "y", T)).toBe(27);
  });

  it("scaling", () => {
    const S = [
      [2, 0, 0],
      [0, 3, 0],
    ] as cmath.Transform;
    expect(cmath.delta.transform(4, "x", S)).toBe(8);
    expect(cmath.delta.transform(4, "y", S)).toBe(12);
  });
});
