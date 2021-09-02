import { TreeArray } from "../treearray";

const ta = new TreeArray(
  [
    {
      id: "1",
      sort: 1,
      parent: "root",
    },
    {
      id: "2",
      sort: 0,
      parent: "root",
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
  ],
  "root"
);

test("TreeArray#asTree", () => {
  expect(ta.asTree()).toStrictEqual([
    {
      id: "2",
      parent: "root",
      sort: 0,
      depth: 0,
      children: [{ children: [], id: "2-1", depth: 1, parent: "2", sort: 1 }],
    },
    {
      id: "1",
      parent: "root",
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
      parent: "root",
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
      parent: "root",
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

const _realword_page_data = [
  {
    id: "28vC7gacEoan26I-hMYLd",
    type: "boring-document",
    name: "Screen : Newest World Vibes",
    sort: 1,
    document: "lRe4CNKITjKnE6tJF3V3g",
    parent: "built-in/getting-started",
  },
  {
    id: "FF5748KwNmc3RskBRNDUF",
    type: "boring-document",
    name: "1",
    sort: 1,
    document: "TJp8oOJWahzV9ujJ6q9HF",
    parent: "gU497Iss-Vi7I_aD4TMdD",
  },
  {
    id: "T44S2eNSCZmz23xeMVrtW",
    type: "boring-document",
    name: "k",
    sort: 0,
    document: "QuM1FzumAUMTUaCXpDZ0-",
    parent: "page-root",
  },
  {
    id: "ULtPuVuLdb6pS3hUh8Ej7",
    type: "boring-document",
    name: "2",
    sort: 0,
    document: "JhvKo6odE_xKOgJ8DTGKB",
    parent: "page-root",
  },
  {
    id: "gU497Iss-Vi7I_aD4TMdD",
    type: "boring-document",
    name: "1",
    sort: 1,
    document: "hj_R2ce8LIi_ZgBulQYp-",
    parent: "qphgGrEGcE-gWdkwTIPne",
  },
  {
    id: "qphgGrEGcE-gWdkwTIPne",
    type: "boring-document",
    name: "1",
    sort: 0,
    document: "1e2VIu_nZTXLIXdXBXLbC",
    parent: "page-root",
  },
  {
    type: "boring-document",
    id: "built-in/getting-started",
    name: "Getting started",
    sort: 0,
    parent: "page-root",
  },
];

const _ta_realworld = new TreeArray(_realword_page_data, "page-root");

test("tree array test with realworld example", () => {
  //
  const arr = _ta_realworld.asTreeArray();

  expect(arr).toStrictEqual([]);
});
