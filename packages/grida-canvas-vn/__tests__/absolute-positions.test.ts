import { vn } from "../vn";

describe("VectorNetworkEditor absolute positions", () => {
  it("returns vertex absolute positions", () => {
    const net = vn.polyline([
      [0, 0],
      [10, 0],
    ]);
    const editor = new vn.VectorNetworkEditor(net);
    expect(editor.getVerticesAbsolute([5, 5])).toEqual([
      [5, 5],
      [15, 5],
    ]);
  });

  it("returns control point absolute positions", () => {
    const net: vn.VectorNetwork = {
      vertices: [
        [0, 0],
        [10, 0],
      ],
      segments: [{ a: 0, b: 1, ta: [0, 10], tb: [0, 10] }],
    };
    const editor = new vn.VectorNetworkEditor(net);
    const pts = editor.getControlPointsAbsolute();
    expect(pts).toContainEqual({ segment: 0, control: "ta", point: [0, 10] });
    expect(pts).toContainEqual({ segment: 0, control: "tb", point: [10, 10] });
  });
});
