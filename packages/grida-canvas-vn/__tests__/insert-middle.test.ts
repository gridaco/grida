import { vn } from "../vn";

describe("insertMiddleVertex", () => {
  it("splits a straight segment", () => {
    const base = vn.polyline([
      [0, 0],
      [10, 0],
      [20, 0],
    ]);
    const editor = new vn.VectorNetworkEditor(base);
    const newIndex = editor.insertMiddleVertex(0);

    expect(newIndex).toBe(3);
    expect(editor.vertices.length).toBe(4);
    expect(editor.segments.length).toBe(3);
    expect(editor.vertices[newIndex].p).toEqual([5, 0]);
    expect(editor.segments[0]).toEqual({ a: 0, b: newIndex, ta: [0, 0], tb: [0, 0] });
    expect(editor.segments[1]).toEqual({ a: newIndex, b: 1, ta: [0, 0], tb: [0, 0] });
  });
});
