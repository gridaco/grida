import { vn } from "../vn";

describe("removeUnusedVertex", () => {
  it("removes vertex without dependents and reindexes segments", () => {
    const net: vn.VectorNetwork = {
      vertices: [
        [0, 0],
        [1, 0],
        [2, 0],
        [3, 0],
      ],
      segments: [{ a: 0, b: 2, ta: [0, 0], tb: [0, 0] }],
    };

    const editor = new vn.VectorNetworkEditor(net);
    const removed = editor.removeUnusedVertex(1);

    expect(removed).toBe(true);
    expect(editor.vertices.length).toBe(3);
    expect(editor.vertices[1]).toEqual([2, 0]);
    expect(editor.segments[0]).toEqual({ a: 0, b: 1, ta: [0, 0], tb: [0, 0] });
  });

  it("does nothing when vertex has dependents", () => {
    const net = vn.polyline([
      [0, 0],
      [1, 0],
      [2, 0],
    ]);
    const editor = new vn.VectorNetworkEditor(net);
    const removed = editor.removeUnusedVertex(1);

    expect(removed).toBe(false);
    expect(editor.vertices.length).toBe(3);
    expect(editor.segments.length).toBe(2);
  });
});
