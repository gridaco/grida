import { vn } from "../vn";

describe("VectorNetworkEditor region detection", () => {
  const squareA = vn.polygon([
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ]);
  const squareB = vn.polygon([
    [20, 20],
    [30, 20],
    [30, 30],
    [20, 30],
  ]);
  const net = vn.VectorNetworkEditor.union(squareA, squareB);
  const editor = new vn.VectorNetworkEditor(net);

  it("lists all closed regions", () => {
    const regions = editor.getLoops();
    expect(regions).toHaveLength(2);
  });

  it("checks if a point is inside any region", () => {
    expect(editor.isPointInRegion([5, 5])).toBe(true);
    expect(editor.isPointInRegion([25, 25])).toBe(true);
    expect(editor.isPointInRegion([15, 15])).toBe(false);
  });
});
