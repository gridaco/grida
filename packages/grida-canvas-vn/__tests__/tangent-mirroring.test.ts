import { vn } from "../vn";

describe("VectorNetworkEditor tangent mirroring", () => {
  const createNetwork = (): vn.VectorNetwork => ({
    vertices: [{ p: [0, 0] }, { p: [10, 0] }, { p: [20, 0] }],
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

  it("mirrors previous segment when editing ta", () => {
    const vne = new vn.VectorNetworkEditor(createNetwork());
    vne.updateTangent(1, "ta", [0, 5], "all");
    expect(vne.segments[1].ta).toEqual([0, 5]);
    expect(vne.segments[0].tb[0]).toBeCloseTo(0);
    expect(vne.segments[0].tb[1]).toBeCloseTo(-5);
  });
});
