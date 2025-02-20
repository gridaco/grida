import { groupByPath } from "./group-by-path-name";

test("group by path names", () => {
  const nodes = [
    {
      id: "1",
      path: "a",
    },
    {
      id: "2",
      path: "/",
    },
    {
      id: "3",
      path: "/a",
    },
    {
      id: "4",
      path: "/b",
    },
    {
      id: "5",
      path: "/",
    },
    {
      id: "6",
      path: "/a/b",
    },
    {
      id: "7",
      path: "/a/a",
    },
    {
      id: "8",
      path: "/a/a/a",
    },
    {
      id: "9",
      path: "/a/a/a/a",
    },
  ];

  const res = groupByPath(nodes, {
    key: "path",
  });

  expect(res.get("/a")).toStrictEqual([
    {
      id: "6",
      path: "/a/b",
    },
    {
      id: "7",
      path: "/a/a",
    },
  ]);
});
