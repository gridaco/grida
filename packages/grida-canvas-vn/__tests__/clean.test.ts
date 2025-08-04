import { vn } from "../vn";

describe("VectorNetworkEditor.clean", () => {
  const raw: vn.VectorNetwork = {
    vertices: [
      { p: [0, 0] },
      { p: [10, 0] },
      { p: [10, 0] },
      { p: [20, 0] },
    ],
    segments: [
      { a: 0, b: 1, ta: [0, 0], tb: [0, 0] },
      { a: 0, b: 2, ta: [0, 0], tb: [0, 0] },
      { a: 2, b: 3, ta: [0, 0], tb: [0, 0] },
      { a: 1, b: 3, ta: [0, 0], tb: [0, 0] },
    ],
  };

  const expected: vn.VectorNetwork = {
    vertices: [
      { p: [0, 0] },
      { p: [10, 0] },
      { p: [20, 0] },
    ],
    segments: [
      { a: 0, b: 1, ta: [0, 0], tb: [0, 0] },
      { a: 1, b: 2, ta: [0, 0], tb: [0, 0] },
    ],
  };

  it("deduplicates a network (static)", () => {
    const cleaned = vn.VectorNetworkEditor.clean(raw);
    expect(cleaned).toEqual(expected);
  });

  it("deduplicates the instance network", () => {
    const editor = new vn.VectorNetworkEditor(raw);
    const cleaned = editor.clean();
    expect(cleaned).toEqual(expected);
    expect(editor.value).toEqual(expected);
  });

  it("deduplicates vertices within tolerance (static)", () => {
    const nearly: vn.VectorNetwork = {
      vertices: [
        { p: [0, 0] },
        { p: [10, 0] },
        { p: [10.25, 0] },
      ],
      segments: [
        { a: 0, b: 1, ta: [0, 0], tb: [0, 0] },
        { a: 0, b: 2, ta: [0, 0], tb: [0, 0] },
      ],
    };

    const cleaned = vn.VectorNetworkEditor.clean(nearly, {
      vertex_tolerance: 0.5,
    });
    expect(cleaned).toEqual({
      vertices: [
        { p: [0, 0] },
        { p: [10, 0] },
      ],
      segments: [{ a: 0, b: 1, ta: [0, 0], tb: [0, 0] }],
    });
  });

  it("deduplicates vertices within tolerance (instance)", () => {
    const nearly: vn.VectorNetwork = {
      vertices: [
        { p: [0, 0] },
        { p: [10, 0] },
        { p: [10.25, 0] },
      ],
      segments: [
        { a: 0, b: 1, ta: [0, 0], tb: [0, 0] },
        { a: 0, b: 2, ta: [0, 0], tb: [0, 0] },
      ],
    };
    const editor = new vn.VectorNetworkEditor(nearly);
    const cleaned = editor.clean({ vertex_tolerance: 0.5 });
    expect(cleaned).toEqual({
      vertices: [
        { p: [0, 0] },
        { p: [10, 0] },
      ],
      segments: [{ a: 0, b: 1, ta: [0, 0], tb: [0, 0] }],
    });
    expect(editor.value).toEqual(cleaned);
  });
});
