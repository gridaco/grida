import { vn } from "../vn";

describe("VectorNetworkEditor tangent mirroring", () => {
  const createNetwork = (): vn.VectorNetwork => ({
    vertices: [
      [0, 0],
      [10, 0],
      [20, 0],
    ],
    segments: [
      { a: 0, b: 1, ta: [0, 0], tb: [10, 0] },
      { a: 1, b: 2, ta: [-10, 0], tb: [0, 0] },
    ],
  });

  it("does not mirror when mode is none", () => {
    const vne = new vn.VectorNetworkEditor(createNetwork());
    vne.updateTangent(0, "tb", [0, 5], "none");
    expect(vne.segments[0].tb).toEqual([0, 5]);
    expect(vne.segments[1].ta).toEqual([-10, 0]);
  });

  it("mirrors angle and length when mode is all", () => {
    const vne = new vn.VectorNetworkEditor(createNetwork());
    vne.updateTangent(0, "tb", [0, 5], "all");
    expect(vne.segments[0].tb).toEqual([0, 5]);
    expect(vne.segments[1].ta[0]).toBeCloseTo(0);
    expect(vne.segments[1].ta[1]).toBeCloseTo(-5);
  });

  it("mirrors angle only when mode is angle", () => {
    const vne = new vn.VectorNetworkEditor(createNetwork());
    vne.updateTangent(0, "tb", [0, 5], "angle");
    expect(vne.segments[0].tb).toEqual([0, 5]);
    expect(vne.segments[1].ta[0]).toBeCloseTo(0);
    expect(vne.segments[1].ta[1]).toBeCloseTo(-10);
  });

  it("auto mirrors when tangents are already mirrored", () => {
    const vne = new vn.VectorNetworkEditor(createNetwork());
    vne.updateTangent(0, "tb", [0, 5], "auto");
    expect(vne.segments[0].tb).toEqual([0, 5]);
    expect(vne.segments[1].ta[0]).toBeCloseTo(0);
    expect(vne.segments[1].ta[1]).toBeCloseTo(-5);
  });

  it("auto mirrors angle when only angle matches", () => {
    const network = createNetwork();
    network.segments[1].ta = [-5, 0];
    const vne = new vn.VectorNetworkEditor(network);
    vne.updateTangent(0, "tb", [0, 5], "auto");
    expect(vne.segments[0].tb).toEqual([0, 5]);
    expect(vne.segments[1].ta[0]).toBeCloseTo(0);
    expect(vne.segments[1].ta[1]).toBeCloseTo(-5);
  });

  it("auto does not mirror when tangents differ", () => {
    const network = createNetwork();
    network.segments[1].ta = [-5, 5];
    const vne = new vn.VectorNetworkEditor(network);
    vne.updateTangent(0, "tb", [0, 5], "auto");
    expect(vne.segments[0].tb).toEqual([0, 5]);
    expect(vne.segments[1].ta).toEqual([-5, 5]);
  });

  it("mirrors previous segment when editing ta", () => {
    const vne = new vn.VectorNetworkEditor(createNetwork());
    vne.updateTangent(1, "ta", [0, 5], "all");
    expect(vne.segments[1].ta).toEqual([0, 5]);
    expect(vne.segments[0].tb[0]).toBeCloseTo(0);
    expect(vne.segments[0].tb[1]).toBeCloseTo(-5);
  });
});

describe("inferMirroringMode", () => {
  it("detects full mirroring", () => {
    expect(vn.inferMirroringMode([10, 0], [-10, 0])).toBe("all");
  });
  it("detects angle mirroring", () => {
    expect(vn.inferMirroringMode([10, 0], [-5, 0])).toBe("angle");
  });
  it("detects angle mirroring with slight deviation", () => {
    expect(vn.inferMirroringMode([10, 0], [-5, 0.001])).toBe("angle");
  });
  it("detects no mirroring", () => {
    expect(vn.inferMirroringMode([10, 0], [5, 5])).toBe("none");
  });
  it("returns none when a tangent is zero", () => {
    expect(vn.inferMirroringMode([0, 0], [-10, 0])).toBe("none");
    expect(vn.inferMirroringMode([10, 0], [0, 0])).toBe("none");
    expect(vn.inferMirroringMode([0, 0], [0, 0])).toBe("none");
  });
});
