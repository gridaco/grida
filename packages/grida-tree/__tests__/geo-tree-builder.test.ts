import { node } from "../src/geo-tree-builder";

describe("geo tree builder", () => {
  test("builds nested tree", () => {
    const tree = node("html")
      .child(node("body").child(node("div").child(node("span"))))
      .build();
    expect(tree).toEqual({
      id: "html",
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      children: [
        {
          id: "body",
          bounds: { x: 0, y: 0, width: 0, height: 0 },
          children: [
            {
              id: "div",
              bounds: { x: 0, y: 0, width: 0, height: 0 },
              children: [
                {
                  id: "span",
                  bounds: { x: 0, y: 0, width: 0, height: 0 },
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    });
  });

  test("accepts multiple children", () => {
    const root = node("root");
    const childA = node("a");
    const childB = node("b");
    root.child(childA, childB);
    expect(root.build().children?.map((c) => c.id)).toEqual(["a", "b"]);
  });

  test("sets bounds", () => {
    const root = node("root").bounds(1, 2, 3, 4).build();
    expect(root.bounds).toEqual({ x: 1, y: 2, width: 3, height: 4 });
  });
});
