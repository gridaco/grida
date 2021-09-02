import { TreeArray } from "../treearray";

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
    id: "1-1-1",
    sort: 100,
    parent: "1-1",
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

test("TreeArray#asTree", () => {
  expect(ta.asTree()).toStrictEqual([
    {
      id: "2",
      parent: null,
      sort: 0,
      depth: 0,
      children: [{ children: [], id: "2-1", depth: 1, parent: "2", sort: 1 }],
    },
    {
      id: "1",
      parent: null,
      sort: 1,
      depth: 0,
      children: [
        {
          id: "1-1",
          parent: "1",
          sort: 2,
          depth: 1,
          children: [
            { depth: 2, id: "1-1-1", parent: "1-1", sort: 100, children: [] },
          ],
        },
        { id: "1-2", depth: 1, parent: "1", sort: 3, children: [] },
        { id: "1-3", depth: 1, parent: "1", sort: 4, children: [] },
      ],
    },
  ]);
});

test("TreeArray#asTreeArray", () => {
  expect(ta.asTreeArray()).toStrictEqual([
    {
      id: "2",
      sort: 0,
      parent: null,
      depth: 0,
    },
    {
      id: "2-1",
      sort: 1,
      parent: "2",
      depth: 1,
    },
    {
      id: "1",
      sort: 1,
      parent: null,
      depth: 0,
    },
    {
      id: "1-1",
      sort: 2,
      parent: "1",
      depth: 1,
    },
    {
      id: "1-1-1",
      sort: 100,
      parent: "1-1",
      depth: 2,
    },
    {
      id: "1-2",
      sort: 3,
      parent: "1",
      depth: 1,
    },
    {
      id: "1-3",
      sort: 4,
      parent: "1",
      depth: 1,
    },
  ]);
});
