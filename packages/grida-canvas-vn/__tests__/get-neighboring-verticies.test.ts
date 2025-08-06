import { vn } from "../vn";

describe("VectorNetworkEditor.getNeighboringVerticies", () => {
  it("returns vertices connected by segments", () => {
    const network: vn.VectorNetwork = {
      vertices: [{ p: [0, 0] }, { p: [10, 0] }, { p: [20, 0] }, { p: [30, 0] }],
      segments: [
        { a: 0, b: 1, ta: [0, 0], tb: [0, 0] },
        { a: 1, b: 2, ta: [0, 0], tb: [0, 0] },
        { a: 2, b: 3, ta: [0, 0], tb: [0, 0] },
      ],
    };
    const editor = new vn.VectorNetworkEditor(network);
    expect(editor.getNeighboringVerticies(1)).toEqual([0, 2]);
    expect(editor.getNeighboringVerticies(0)).toEqual([1]);
    expect(editor.getNeighboringVerticies(3)).toEqual([2]);
  });

  it("returns empty array for isolated vertex", () => {
    const network: vn.VectorNetwork = {
      vertices: [{ p: [0, 0] }, { p: [10, 0] }, { p: [20, 0] }],
      segments: [{ a: 0, b: 1, ta: [0, 0], tb: [0, 0] }],
    };
    const editor = new vn.VectorNetworkEditor(network);
    expect(editor.getNeighboringVerticies(2)).toEqual([]);
  });

  it("deduplicates neighbours from directed segments", () => {
    const network: vn.VectorNetwork = {
      vertices: [{ p: [0, 0] }, { p: [10, 0] }],
      segments: [
        { a: 0, b: 1, ta: [0, 0], tb: [0, 0] },
        { a: 1, b: 0, ta: [0, 0], tb: [0, 0] },
      ],
    };
    const editor = new vn.VectorNetworkEditor(network);
    expect(editor.getNeighboringVerticies(0)).toEqual([1]);
    expect(editor.getNeighboringVerticies(1)).toEqual([0]);
  });
});
