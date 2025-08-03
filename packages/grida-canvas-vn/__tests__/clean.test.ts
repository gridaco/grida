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
});
