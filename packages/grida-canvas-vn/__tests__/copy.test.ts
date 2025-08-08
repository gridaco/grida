import { vn } from "../vn";

describe("VectorNetworkEditor.copy", () => {
  it("copies a single vertex", () => {
    const network: vn.VectorNetwork = {
      vertices: [
        [0, 0],
        [10, 10],
      ],
      segments: [],
    };
    const editor = new vn.VectorNetworkEditor(network);
    const result = editor.copy({ vertices: [0] });
    expect(result).toEqual({ vertices: [[0, 0]], segments: [] });
  });

  it("copies multiple verticies", () => {
    const network: vn.VectorNetwork = {
      vertices: [
        [0, 0],
        [10, 10],
        [20, 20],
      ],
      segments: [],
    };
    const editor = new vn.VectorNetworkEditor(network);
    const result = editor.copy({ vertices: [0, 2] });
    expect(result.vertices).toHaveLength(2);
    expect(result.vertices[0]).toEqual([0, 0]);
    expect(result.vertices[1]).toEqual([20, 20]);
    expect(result.segments).toHaveLength(0);
  });

  it("copies a single segment with its endpoints", () => {
    const network: vn.VectorNetwork = {
      vertices: [
        [0, 0],
        [10, 0],
      ],
      segments: [{ a: 0, b: 1, ta: [0, 0], tb: [0, 0] }],
    };
    const editor = new vn.VectorNetworkEditor(network);
    const result = editor.copy({ segments: [0] });
    expect(result.vertices).toEqual([
      [0, 0],
      [10, 0],
    ]);
    expect(result.segments).toEqual([{ a: 0, b: 1, ta: [0, 0], tb: [0, 0] }]);
  });

  it("copies multiple segments without duplicating vertices", () => {
    const network: vn.VectorNetwork = {
      vertices: [
        [0, 0],
        [10, 0],
        [20, 0],
      ],
      segments: [
        { a: 0, b: 1, ta: [0, 0], tb: [0, 0] },
        { a: 1, b: 2, ta: [0, 0], tb: [0, 0] },
      ],
    };
    const editor = new vn.VectorNetworkEditor(network);
    const result = editor.copy({ segments: [0, 1] });
    expect(result.vertices).toHaveLength(3);
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]).toEqual({ a: 0, b: 1, ta: [0, 0], tb: [0, 0] });
    expect(result.segments[1]).toEqual({ a: 1, b: 2, ta: [0, 0], tb: [0, 0] });
  });

  it("copies mixed selection of vertices and segments", () => {
    const network: vn.VectorNetwork = {
      vertices: [
        [0, 0],
        [10, 0],
        [20, 0],
      ],
      segments: [
        { a: 0, b: 1, ta: [0, 0], tb: [0, 0] },
        { a: 1, b: 2, ta: [0, 0], tb: [0, 0] },
      ],
    };
    const editor = new vn.VectorNetworkEditor(network);
    const result = editor.copy({ vertices: [2], segments: [0] });
    expect(result.vertices).toHaveLength(3);
    expect(result.segments).toHaveLength(1);
    expect(result.vertices[2]).toEqual([20, 0]);
    expect(result.segments[0]).toEqual({ a: 0, b: 1, ta: [0, 0], tb: [0, 0] });
  });
});
