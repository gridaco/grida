import { vn } from "../vn";

describe("getBBox", () => {
  it("computes bounds from vertices when no segments exist", () => {
    const net: vn.VectorNetwork = {
      vertices: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
      segments: [],
    };

    const bb = vn.getBBox(net);
    expect(bb).toEqual({ x: 0, y: 0, width: 10, height: 10 });
  });
});
