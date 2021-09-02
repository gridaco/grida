import { TreeArray } from "../treearray";

test("TreeArray#asTree", () => {
  const ta = new TreeArray([
    {
      id: "1",
      sort: 1,
      parent: null,
    },
    {
      id: "2",
      sort: 0,
      parent: null,
    },
    {
      id: "1-1",
      sort: 2,
      parent: "1",
    },
    {
      id: "1-3",
      sort: 4,
      parent: "1",
    },
    {
      id: "1-2",
      sort: 3,
      parent: "1",
    },
    {
      id: "2-1",
      sort: 1,
      parent: "2",
    },
  ]);

  expect(ta.asTree()).toStrictEqual([
    {
      children: [{ children: [], id: "2-1", parent: "2", sort: 1 }],
      id: "2",
      parent: null,
      sort: 0,
    },
    {
      children: [
        { children: [], id: "1-1", parent: "1", sort: 2 },
        { children: [], id: "1-2", parent: "1", sort: 3 },
        { children: [], id: "1-3", parent: "1", sort: 4 },
      ],
      id: "1",
      parent: null,
      sort: 1,
    },
  ]);
});
