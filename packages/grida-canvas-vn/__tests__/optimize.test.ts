import { vn } from "../vn";

describe("VectorNetworkEditor.optimize", () => {
  const raw: vn.VectorNetwork = {
    vertices: [{ p: [0, 0] }, { p: [10, 0] }, { p: [10, 0] }, { p: [20, 0] }],
    segments: [
      { a: 0, b: 1, ta: [0, 0], tb: [0, 0] },
      { a: 0, b: 2, ta: [0, 0], tb: [0, 0] },
      { a: 2, b: 3, ta: [0, 0], tb: [0, 0] },
      { a: 1, b: 3, ta: [0, 0], tb: [0, 0] },
    ],
  };

  const expected: vn.VectorNetwork = {
    vertices: [{ p: [0, 0] }, { p: [10, 0] }, { p: [20, 0] }],
    segments: [
      { a: 0, b: 1, ta: [0, 0], tb: [0, 0] },
      { a: 1, b: 2, ta: [0, 0], tb: [0, 0] },
    ],
  };

  it("deduplicates a network (static)", () => {
    const optimized = vn.VectorNetworkEditor.optimize(raw);
    expect(optimized).toEqual(expected);
  });

  it("deduplicates the instance network", () => {
    const editor = new vn.VectorNetworkEditor(raw);
    const optimized = editor.optimize();
    expect(optimized).toEqual(expected);
    expect(editor.value).toEqual(expected);
  });

  it("deduplicates vertices within tolerance (static)", () => {
    const nearly: vn.VectorNetwork = {
      vertices: [{ p: [0, 0] }, { p: [10, 0] }, { p: [10.25, 0] }],
      segments: [
        { a: 0, b: 1, ta: [0, 0], tb: [0, 0] },
        { a: 0, b: 2, ta: [0, 0], tb: [0, 0] },
      ],
    };

    const optimized = vn.VectorNetworkEditor.optimize(nearly, {
      vertex_tolerance: 0.5,
      remove_unused_verticies: true,
    });
    expect(optimized).toEqual({
      vertices: [{ p: [0, 0] }, { p: [10, 0] }],
      segments: [{ a: 0, b: 1, ta: [0, 0], tb: [0, 0] }],
    });
  });

  it("deduplicates vertices within tolerance (instance)", () => {
    const nearly: vn.VectorNetwork = {
      vertices: [{ p: [0, 0] }, { p: [10, 0] }, { p: [10.25, 0] }],
      segments: [
        { a: 0, b: 1, ta: [0, 0], tb: [0, 0] },
        { a: 0, b: 2, ta: [0, 0], tb: [0, 0] },
      ],
    };
    const editor = new vn.VectorNetworkEditor(nearly);
    const optimized = editor.optimize({
      vertex_tolerance: 0.5,
      remove_unused_verticies: true,
    });
    expect(optimized).toEqual({
      vertices: [{ p: [0, 0] }, { p: [10, 0] }],
      segments: [{ a: 0, b: 1, ta: [0, 0], tb: [0, 0] }],
    });
    expect(editor.value).toEqual(optimized);
  });

  it("removes unused vertices when configured", () => {
    const net: vn.VectorNetwork = {
      vertices: [{ p: [0, 0] }, { p: [10, 0] }, { p: [20, 0] }],
      segments: [{ a: 0, b: 1, ta: [0, 0], tb: [0, 0] }],
    };

    const optimized = vn.VectorNetworkEditor.optimize(net, {
      vertex_tolerance: 0,
      remove_unused_verticies: true,
    });

    expect(optimized.vertices).toEqual([{ p: [0, 0] }, { p: [10, 0] }]);
    expect(optimized.segments).toEqual([
      { a: 0, b: 1, ta: [0, 0], tb: [0, 0] },
    ]);
  });
});
