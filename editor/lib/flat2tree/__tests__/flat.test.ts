import { depth1, tree, type FlatItem } from "..";

describe("mktree", () => {
  it("should create a fully nested tree", () => {
    const items: FlatItem[] = [
      { isFolder: true, id: "f1" },
      { isFolder: false, id: "i1" },
      { isFolder: false, id: "i2" },
      { isFolder: true, id: "f2" },
      { isFolder: false, id: "i3" },
      { isFolder: false, id: "i4" },
    ];

    const result = tree(items);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "f1",
      parent_id: null,
      children: [
        {
          id: "i1",
          parent_id: "f1",
          children: [],
        },
        {
          id: "i2",
          parent_id: "f1",
          children: [],
        },
        {
          id: "f2",
          parent_id: "f1",
          children: [
            {
              id: "i3",
              parent_id: "f2",
              children: [],
            },
            {
              id: "i4",
              parent_id: "f2",
              children: [],
            },
          ],
        },
      ],
    });
  });

  it("should create a tree with depth limit of 1", () => {
    const items: FlatItem[] = [
      { isFolder: true, id: "f1" },
      { isFolder: false, id: "i1" },
      { isFolder: false, id: "i2" },
      { isFolder: true, id: "f2" },
      { isFolder: false, id: "i3" },
      { isFolder: false, id: "i4" },
    ];

    const result = depth1(items);

    expect(result).toHaveLength(2);
    expect(result).toEqual(
      expect.arrayContaining([
        {
          id: "f1",
          parent_id: null,
          children: [
            {
              id: "i1",
              parent_id: "f1",
              children: [],
            },
            {
              id: "i2",
              parent_id: "f1",
              children: [],
            },
          ],
        },
        {
          id: "f2",
          parent_id: null,
          children: [
            {
              id: "i3",
              parent_id: "f2",
              children: [],
            },
            {
              id: "i4",
              parent_id: "f2",
              children: [],
            },
          ],
        },
      ])
    );
  });
});
