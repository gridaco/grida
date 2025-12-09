import colors, {
  randomcolorname,
  neutral_colors,
  type ColorName,
} from "./tailwindcolors";

describe("tailwindcolors", () => {
  it("exports colors object", () => {
    expect(colors).toBeDefined();
    expect(typeof colors).toBe("object");
  });

  it("has all color families", () => {
    const expectedColors: ColorName[] = [
      "slate",
      "gray",
      "zinc",
      "neutral",
      "stone",
      "red",
      "orange",
      "amber",
      "yellow",
      "lime",
      "green",
      "emerald",
      "teal",
      "cyan",
      "sky",
      "blue",
      "indigo",
      "violet",
      "purple",
      "fuchsia",
      "pink",
      "rose",
    ];
    expectedColors.forEach((color) => {
      expect(colors[color]).toBeDefined();
    });
  });

  it("has all shades for each color", () => {
    const shades = [
      "50",
      "100",
      "200",
      "300",
      "400",
      "500",
      "600",
      "700",
      "800",
      "900",
      "950",
    ];
    Object.values(colors).forEach((palette) => {
      shades.forEach((shade) => {
        expect(palette[shade as keyof typeof palette]).toBeDefined();
      });
    });
  });

  it("colors are in oklch format", () => {
    expect(colors.amber["500"]).toMatch(/^oklch\(/);
    expect(colors.slate["500"]).toMatch(/^oklch\(/);
    expect(colors.blue["500"]).toMatch(/^oklch\(/);
  });

  it("randomcolorname returns a valid color name", () => {
    const color = randomcolorname();
    expect(colors[color]).toBeDefined();
  });

  it("randomcolorname excludes neutral colors", () => {
    for (let i = 0; i < 10; i++) {
      const color = randomcolorname({ exclude: neutral_colors });
      expect(neutral_colors).not.toContain(color);
    }
  });

  it("neutral_colors are defined", () => {
    expect(neutral_colors).toEqual([
      "neutral",
      "zinc",
      "stone",
      "slate",
      "gray",
    ]);
  });
});
