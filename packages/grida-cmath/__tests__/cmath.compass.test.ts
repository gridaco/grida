import cmath from "..";

describe("cmath.compass.cardinalComponents", () => {
  it("decomposes orthogonal directions into a single component", () => {
    expect(cmath.compass.cardinalComponents("n")).toEqual({
      north: true,
      south: false,
      east: false,
      west: false,
    });
    expect(cmath.compass.cardinalComponents("s")).toEqual({
      north: false,
      south: true,
      east: false,
      west: false,
    });
    expect(cmath.compass.cardinalComponents("e")).toEqual({
      north: false,
      south: false,
      east: true,
      west: false,
    });
    expect(cmath.compass.cardinalComponents("w")).toEqual({
      north: false,
      south: false,
      east: false,
      west: true,
    });
  });

  it("decomposes diagonal directions into two components", () => {
    expect(cmath.compass.cardinalComponents("ne")).toEqual({
      north: true,
      south: false,
      east: true,
      west: false,
    });
    expect(cmath.compass.cardinalComponents("se")).toEqual({
      north: false,
      south: true,
      east: true,
      west: false,
    });
    expect(cmath.compass.cardinalComponents("sw")).toEqual({
      north: false,
      south: true,
      east: false,
      west: true,
    });
    expect(cmath.compass.cardinalComponents("nw")).toEqual({
      north: true,
      south: false,
      east: false,
      west: true,
    });
  });

  it("never reports opposite components together", () => {
    const dirs: cmath.compass.ResizeDirection[] = [
      "n",
      "e",
      "s",
      "w",
      "ne",
      "se",
      "sw",
      "nw",
    ];
    for (const dir of dirs) {
      const c = cmath.compass.cardinalComponents(dir);
      expect(c.north && c.south).toBe(false);
      expect(c.east && c.west).toBe(false);
    }
  });
});
