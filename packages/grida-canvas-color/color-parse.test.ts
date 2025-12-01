import parse from "./color-parse";

/** parse-color tests */

describe("color-parse", () => {
  it("#ffa500", () => {
    expect(parse("#ffa500")).toEqual({
      space: "rgb",
      values: [255, 165, 0],
      alpha: 1,
    });
  });

  it("#333", () => {
    expect(parse("#333")).toEqual({
      space: "rgb",
      values: [51, 51, 51],
      alpha: 1,
    });
  });

  it("#f98", () => {
    expect(parse("#f98")).toEqual({
      space: "rgb",
      values: [255, 153, 136],
      alpha: 1,
    });
  });

  it("lime", () => {
    expect(parse("lime")).toEqual({
      space: "rgb",
      values: [0, 255, 0],
      alpha: 1,
    });
    expect(parse("LIME")).toEqual({
      space: "rgb",
      values: [0, 255, 0],
      alpha: 1,
    });
  });

  it("hsl(210,50,50)", () => {
    expect(parse("hsl(210,50,50)")).toEqual({
      space: "hsl",
      values: [210, 50, 50],
      alpha: 1,
    });
  });

  it("rgba(153,50,204,60%)", () => {
    expect(parse("rgba(153,50,204,60%)")).toEqual({
      space: "rgb",
      values: [153, 50, 204],
      alpha: 0.6,
    });
  });

  it("#fef", () => {
    expect(parse("#fef")).toEqual({
      space: "rgb",
      values: [255, 238, 255],
      alpha: 1,
    });
  });

  it("#fffFEF", () => {
    expect(parse("#fffFEF")).toEqual({
      space: "rgb",
      values: [255, 255, 239],
      alpha: 1,
    });
  });

  it("rgb(244, 233, 100)", () => {
    expect(parse("rgb(244, 233, 100)")).toEqual({
      space: "rgb",
      values: [244, 233, 100],
      alpha: 1,
    });
  });

  it("rgb(100%, 30%, 90%)", () => {
    expect(parse("rgb(100%, 30%, 90%)")).toEqual({
      space: "rgb",
      values: [255, 76.5, 229.5],
      alpha: 1,
    });
  });

  it("transparent", () => {
    expect(parse("transparent")).toEqual({
      space: "rgb",
      values: [0, 0, 0],
      alpha: 0,
    });
  });

  it("hsl(240, 100%, 50.5%)", () => {
    expect(parse("hsl(240, 100%, 50.5%)")).toEqual({
      space: "hsl",
      values: [240, 100, 50.5],
      alpha: 1,
    });
  });

  it("hsl(240deg, 100%, 50.5%)", () => {
    expect(parse("hsl(240deg, 100%, 50.5%)")).toEqual({
      space: "hsl",
      values: [240, 100, 50.5],
      alpha: 1,
    });
  });

  it("hwb(240, 100%, 50.5%)", () => {
    expect(parse("hwb(240, 100%, 50.5%)")).toEqual({
      space: "hwb",
      values: [240, 100, 50.5],
      alpha: 1,
    });
  });

  it("hwb(240deg, 100%, 50.5%)", () => {
    expect(parse("hwb(240deg, 100%, 50.5%)")).toEqual({
      space: "hwb",
      values: [240, 100, 50.5],
      alpha: 1,
    });
  });

  it("blue", () => {
    expect(parse("blue")).toEqual({
      space: "rgb",
      values: [0, 0, 255],
      alpha: 1,
    });
    expect(parse("BLUE")).toEqual({
      space: "rgb",
      values: [0, 0, 255],
      alpha: 1,
    });
  });

  it("rgb(244, 233, 100)", () => {
    expect(parse("rgb(244, 233, 100)")).toEqual({
      space: "rgb",
      values: [244, 233, 100],
      alpha: 1,
    });
  });

  it("rgba(244, 233, 100, 0.5)", () => {
    expect(parse("rgba(244, 233, 100, 0.5)")).toEqual({
      space: "rgb",
      values: [244, 233, 100],
      alpha: 0.5,
    });
  });

  it("hsla(244, 100%, 100%, 0.6)", () => {
    expect(parse("hsla(244, 100%, 100%, 0.6)")).toEqual({
      space: "hsl",
      values: [244, 100, 100],
      alpha: 0.6,
    });
  });

  it("hwb(244, 100%, 100%, 0.6)", () => {
    expect(parse("hwb(244, 100%, 100%, 0.6)")).toEqual({
      space: "hwb",
      values: [244, 100, 100],
      alpha: 0.6,
    });
  });

  it("hwb(244, 100%, 100%)", () => {
    expect(parse("hwb(244, 100%, 100%)")).toEqual({
      space: "hwb",
      values: [244, 100, 100],
      alpha: 1,
    });
  });

  it("rgba(200, 20, 233, 0.2)", () => {
    expect(parse("rgba(200, 20, 233, 0.2)")).toEqual({
      space: "rgb",
      values: [200, 20, 233],
      alpha: 0.2,
    });
  });

  it("rgba(200, 20, 233, 0)", () => {
    expect(parse("rgba(200, 20, 233, 0)")).toEqual({
      space: "rgb",
      values: [200, 20, 233],
      alpha: 0,
    });
  });

  it("rgba(100%, 30%, 90%, 0.2)", () => {
    expect(parse("rgba(100%, 30%, 90%, 0.2)")).toEqual({
      space: "rgb",
      values: [255, 76.5, 229.5],
      alpha: 0.2,
    });
  });

  it("rgba(200 20 233 / 0.2)", () => {
    expect(parse("rgba(200 20 233 / 0.2)")).toEqual({
      space: "rgb",
      values: [200, 20, 233],
      alpha: 0.2,
    });
  });

  it("rgba(200 20 233 / 20%)", () => {
    expect(parse("rgba(200 20 233 / 20%)")).toEqual({
      space: "rgb",
      values: [200, 20, 233],
      alpha: 0.2,
    });
  });

  it("hsla(200, 20%, 33%, 0.2)", () => {
    expect(parse("hsla(200, 20%, 33%, 0.2)")).toEqual({
      space: "hsl",
      values: [200, 20, 33],
      alpha: 0.2,
    });
  });

  it("hwb(200, 20%, 33%, 0.2)", () => {
    expect(parse("hwb(200, 20%, 33%, 0.2)")).toEqual({
      space: "hwb",
      values: [200, 20, 33],
      alpha: 0.2,
    });
  });

  it("rgba(200, 20, 233, 0.2)", () => {
    expect(parse("rgba(200, 20, 233, 0.2)")).toEqual({
      space: "rgb",
      values: [200, 20, 233],
      alpha: 0.2,
    });
  });

  it("rgba(300, 600, 100, 3)", () => {
    expect(parse("rgba(300, 600, 100, 3)")).toEqual({
      space: "rgb",
      values: [300, 600, 100],
      alpha: 3,
    });
  });

  it("rgba(8000%, 100%, 333%, 88)", () => {
    expect(parse("rgba(8000%, 100%, 333%, 88)")).toEqual({
      space: "rgb",
      values: [20400, 255, 849.15],
      alpha: 88,
    });
  });

  it("hsla(400, 10%, 200%, 10)", () => {
    expect(parse("hsla(400, 10%, 200%, 10)")).toEqual({
      space: "hsl",
      values: [400, 10, 200],
      alpha: 10,
    });
  });

  it("hwb(400, 10%, 200%, 10)", () => {
    expect(parse("hwb(400, 10%, 200%, 10)")).toEqual({
      space: "hwb",
      values: [400, 10, 200],
      alpha: 10,
    });
  });

  it("yellowblue", () => {
    expect(parse("yellowblue")).toEqual({
      space: undefined,
      values: [],
      alpha: 1,
    });
    expect(parse("YELLOWBLUE")).toEqual({
      space: undefined,
      values: [],
      alpha: 1,
    });
  });

  it("hsla(101.12, 45.2%, 21.0%, 1.0)", () => {
    expect(parse("hsla(101.12, 45.2%, 21.0%, 1.0)")).toEqual({
      space: "hsl",
      values: [101.12, 45.2, 21.0],
      alpha: 1,
    });
  });

  it("hsla(101.12 45.2% 21.0% / 50%)", () => {
    expect(parse("hsla(101.12 45.2% 21.0% / 50%)")).toEqual({
      space: "hsl",
      values: [101.12, 45.2, 21.0],
      alpha: 0.5,
    });
  });

  it("hsl(red, 10%, 10%)", () => {
    expect(parse("hsl(red, 10%, 10%)")).toEqual({
      space: "hsl",
      values: [0, 10, 10],
      alpha: 1,
    });
  });

  it("hsl(red, 10%, 10%);", () => {
    expect(parse("hsl(red, 10%, 10%);")).toEqual({
      space: "hsl",
      values: [0, 10, 10],
      alpha: 1,
    });
  });

  it("hsl(10deg, 10%, 10%)", () => {
    expect(parse("hsl(10deg, 10%, 10%)")).toEqual({
      space: "hsl",
      values: [10, 10, 10],
      alpha: 1,
    });
  });

  it("hsl(1.5turn, 10%, 10%)", () => {
    expect(parse("hsl(1.5turn, 10%, 10%)")).toEqual({
      space: "hsl",
      values: [540, 10, 10],
      alpha: 1,
    });
  });

  it("lch(5, 5, orange)", () => {
    expect(parse("lch(5, 5, orange)")).toEqual({
      space: "lch",
      values: [5, 5, 60],
      alpha: 1,
    });
  });

  it("lch(5 5 orange / .5)", () => {
    expect(parse("lch(5 5 orange / .5)")).toEqual({
      space: "lch",
      values: [5, 5, 60],
      alpha: 0.5,
    });
  });

  it("lab(0.25, 0.25, 0.25)", () => {
    expect(parse("lab(0.25, 0.25, 0.25)")).toEqual({
      space: "lab",
      values: [0.25, 0.25, 0.25],
      alpha: 1,
    });
  });

  it("lab(0.25 0.25 0.25 / 0.5)", () => {
    expect(parse("lab(0.25 0.25 0.25 / 0.5)")).toEqual({
      space: "lab",
      values: [0.25, 0.25, 0.25],
      alpha: 0.5,
    });
  });

  it("luv(0.25, 0.25, 0.25)", () => {
    expect(parse("luv(0.25, 0.25, 0.25)")).toEqual({
      space: "luv",
      values: [0.25, 0.25, 0.25],
      alpha: 1,
    });
  });

  it("luv(0.25 0.25 0.25 / 0.5)", () => {
    expect(parse("luv(0.25 0.25 0.25 / 0.5)")).toEqual({
      space: "luv",
      values: [0.25, 0.25, 0.25],
      alpha: 0.5,
    });
  });

  it("color(...)", () => {
    // --srgb: color(srgb 1 1 1);
    expect(parse("color(srgb-linear 1 1 1)")).toEqual({
      space: "srgb-linear",
      values: [1, 1, 1],
      alpha: 1,
    });
    // --srgb-linear: color(srgb-linear 100% 100% 100% / 50%);
    expect(parse("color(srgb-linear 100% 100% 100% / 50%)")).toEqual({
      space: "srgb-linear",
      values: [1, 1, 1],
      alpha: 0.5,
    });
    // --display-p3: color(display-p3 1 1 1);
    expect(parse("color(display-p3 1 1 1)")).toEqual({
      space: "display-p3",
      values: [1, 1, 1],
      alpha: 1,
    });
    // --rec2020: color(rec2020 0 0 0);
    expect(parse("color(rec2020 0 0 0)")).toEqual({
      space: "rec2020",
      values: [0, 0, 0],
      alpha: 1,
    });
    // --a98-rgb: color(a98-rgb 1 1 1 / 25%);
    expect(parse("color(a98-rgb 1 1 1 / 25%)")).toEqual({
      space: "a98-rgb",
      values: [1, 1, 1],
      alpha: 0.25,
    });
    // --prophoto: color(prophoto-rgb 0% 0% 0%);
    expect(parse("color(prophoto-rgb 0% 0% 0%)")).toEqual({
      space: "prophoto-rgb",
      values: [0, 0, 0],
      alpha: 1,
    });
    // --xyz: color(xyz 1 1 1);
    expect(parse("color(xyz 1 1 1)")).toEqual({
      space: "xyz",
      values: [1, 1, 1],
      alpha: 1,
    });
  });

  it("oklab", () => {
    expect(parse("oklab(40.1% 0.1143 0.045)")).toEqual({
      space: "oklab",
      values: [0.401, 0.1143, 0.045],
      alpha: 1,
    });
    expect(parse("oklab(59.69% 0.1007 -0.1191 / 0.5)")).toEqual({
      space: "oklab",
      values: [0.5969, 0.1007, -0.1191],
      alpha: 0.5,
    });
    expect(parse("oklab(0.123 100% -100% / 2)")).toEqual({
      space: "oklab",
      values: [0.123, 0.4, -0.4],
      alpha: 2,
    });
    expect(parse("oklab(none none none / none)")).toEqual({
      space: "oklab",
      values: [0, 0, 0],
      alpha: 0,
    });
  });

  it("oklch", () => {
    expect(parse("oklch(40.1% 0.1143 0.045)")).toEqual({
      space: "oklch",
      values: [0.401, 0.1143, 0.045],
      alpha: 1,
    });
    expect(parse("oklch(59.69% 10% 49.77 / 0.5)")).toEqual({
      space: "oklch",
      values: [0.5969, 0.04000000000000001, 49.77],
      alpha: 0.5,
    });
    expect(parse("oklch(40.1% 0.156 49.1% / .5)")).toEqual({
      space: "oklch",
      values: [0.401, 0.156, 176.76],
      alpha: 0.5,
    });
    expect(parse("oklch(none none none / none)")).toEqual({
      space: "oklch",
      values: [0, 0, 0],
      alpha: 0,
    });
  });

  it("#afd6", () => {
    expect(parse("#afd6")).toEqual({
      space: "rgb",
      values: [170, 255, 221],
      alpha: 0.4,
    });
  });

  it("#AFD6", () => {
    expect(parse("#AFD6")).toEqual({
      space: "rgb",
      values: [170, 255, 221],
      alpha: 0.4,
    });
  });

  it("#aaffdd66", () => {
    expect(parse("#aaffdd66")).toEqual({
      space: "rgb",
      values: [170, 255, 221],
      alpha: 0.4,
    });
  });

  it("#AAFFDD66", () => {
    expect(parse("#AAFFDD66")).toEqual({
      space: "rgb",
      values: [170, 255, 221],
      alpha: 0.4,
    });
  });

  it("(R12 / G45 / B234)", () => {
    expect(parse("(R12 / G45 / B234)")).toEqual({
      space: "rgb",
      values: [12, 45, 234],
      alpha: 1,
    });
  });

  it("R:12 G:45 B:234", () => {
    expect(parse("R:12 G:45 B:234")).toEqual({
      space: "rgb",
      values: [12, 45, 234],
      alpha: 1,
    });
  });

  it("C100/M80/Y0/K35", () => {
    expect(parse("C100/M80/Y0/K35")).toEqual({
      space: "cmyk",
      values: [100, 80, 0, 35],
      alpha: 1,
    });
  });

  it.skip("Array", () => {
    expect(parse([1, 2, 3] as any)).toEqual({
      space: "rgb",
      values: [1, 2, 3],
      alpha: 1,
    });
  });

  it.skip("Object", () => {
    expect(parse({ r: 1, g: 2, b: 3 } as any)).toEqual({
      space: "rgb",
      values: [1, 2, 3],
      alpha: 1,
    });
    expect(parse({ red: 1, green: 2, blue: 3 } as any)).toEqual({
      space: "rgb",
      values: [1, 2, 3],
      alpha: 1,
    });
    expect(parse({ h: 1, s: 2, l: 3 } as any)).toEqual({
      space: "hsl",
      values: [1, 2, 3],
      alpha: 1,
    });
  });

  it("Number", () => {
    expect(parse(0xa141e)).toEqual({
      space: "rgb",
      values: [10, 20, 30],
      alpha: 1,
    });
    expect(parse(0xff)).toEqual({
      space: "rgb",
      values: [0x00, 0x00, 0xff],
      alpha: 1,
    });
    expect(parse(0xff0000)).toEqual({
      space: "rgb",
      values: [0xff, 0x00, 0x00],
      alpha: 1,
    });
    expect(parse(0x0000ff)).toEqual({
      space: "rgb",
      values: [0x00, 0x00, 0xff],
      alpha: 1,
    });
    // expect(parse(new Number(0x0000ff))).toEqual({
    //   space: "rgb",
    //   values: [0x00, 0x00, 0xff],
    //   alpha: 1,
    // });
  });
});
