import { vn } from "../vn";

describe("VectorNetworkEditor.getTangentVertex", () => {
  it("returns vertex index for segment tangents", () => {
    const network: vn.VectorNetwork = {
      vertices: [{ p: [0, 0] }, { p: [10, 0] }],
      segments: [{ a: 0, b: 1, ta: [0, 0], tb: [0, 0] }],
    };
    const vne = new vn.VectorNetworkEditor(network);
    expect(vne.getTangentVertex(0, "ta")).toBe(0);
    expect(vne.getTangentVertex(0, "tb")).toBe(1);
  });
});
