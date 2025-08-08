import { vn } from "../vn";

/*
// FIXME: the jest config does not work with svg-pathdata
import { vn } from "../vn";

describe("vector network svg io", () => {
  it("from path data", () => {
    it("d", () => {
      expect(vn.fromSVGPathData("M50 250 Q150 200 250 250 T450 250")).toEqual({
        verticies: [],
        segments: [],
      });
    });
  });
});
*/

describe("splitSegment", () => {
  it("splits a straight segment", () => {
    const base = vn.polyline([
      [0, 0],
      [10, 0],
      [20, 0],
    ]);
    const editor = new vn.VectorNetworkEditor(base);
    const newIndex = editor.splitSegment(0);

    expect(newIndex).toBe(3);
    expect(editor.vertices.length).toBe(4);
    expect(editor.segments.length).toBe(3);
    expect(editor.vertices[newIndex]).toEqual([5, 0]);
    expect(editor.segments[0]).toEqual({
      a: 0,
      b: newIndex,
      ta: [0, 0],
      tb: [0, 0],
    });
    expect(editor.segments[1]).toEqual({
      a: newIndex,
      b: 1,
      ta: [0, 0],
      tb: [0, 0],
    });
  });
});
