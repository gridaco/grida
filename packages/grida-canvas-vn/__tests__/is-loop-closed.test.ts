import { vn } from "../vn";

describe("VectorNetworkEditor isLoopClosed", () => {
  it("returns true for a closed polygon", () => {
    const net = vn.polygon([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
    const editor = new vn.VectorNetworkEditor(net);
    expect(editor.isLoopClosed([0, 1, 2, 3])).toBe(true);
  });

  it("returns false for an open polyline", () => {
    const net = vn.polyline([
      [0, 0],
      [10, 0],
      [20, 0],
    ]);
    const editor = new vn.VectorNetworkEditor(net);
    expect(editor.isLoopClosed([0, 1])).toBe(false);
  });

  it("returns false when segments are not sequential", () => {
    const net = vn.polygon([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
    const editor = new vn.VectorNetworkEditor(net);
    expect(editor.isLoopClosed([0, 2, 1, 3])).toBe(false);
  });
});
