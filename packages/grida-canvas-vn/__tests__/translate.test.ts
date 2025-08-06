import { vn } from "../vn";

describe("VectorNetworkEditor.translate", () => {
  it("translates vertices by delta", () => {
    const net: vn.VectorNetwork = {
      vertices: [{ p: [0, 0] }, { p: [1, 2] }],
      segments: [{ a: 0, b: 1, ta: [0, 0], tb: [0, 0] }],
    };

    const translated = vn.VectorNetworkEditor.translate(net, [10, -5]);

    expect(translated.vertices).toEqual([
      { p: [10, -5] },
      { p: [11, -3] },
    ]);
    expect(translated.segments).toEqual(net.segments);
    // original network should remain unchanged
    expect(net.vertices[0].p).toEqual([0, 0]);
    expect(net.vertices[1].p).toEqual([1, 2]);
  });
});
