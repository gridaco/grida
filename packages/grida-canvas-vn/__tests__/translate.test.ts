import { vn } from "../vn";

describe("VectorNetworkEditor.translate", () => {
  it("translates vertices by delta", () => {
    const net: vn.VectorNetwork = {
      vertices: [
        [0, 0],
        [1, 2],
      ],
      segments: [{ a: 0, b: 1, ta: [0, 0], tb: [0, 0] }],
    };

    const translated = vn.VectorNetworkEditor.translate(net, [10, -5]);

    expect(translated.vertices).toEqual([
      [10, -5],
      [11, -3],
    ]);
    expect(translated.segments).toEqual(net.segments);
    // original network should remain unchanged
    expect(net.vertices[0]).toEqual([0, 0]);
    expect(net.vertices[1]).toEqual([1, 2]);
  });
});
