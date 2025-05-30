import { dq } from "../index";

describe("sibling query selectors", () => {
  const doc = {
    root_id: "root",
    nodes: {
      root: { type: "container", children: ["a", "b", "c"] },
      a: { type: "container", children: [] },
      b: { type: "container", children: [] },
      c: { type: "container", children: [] },
    },
  } as any;

  const ctx = dq.Context.from(doc).snapshot();

  test("~+ selects next sibling and loops", () => {
    expect(dq.querySelector(ctx, ["a"], "~+")).toEqual(["b"]);
    expect(dq.querySelector(ctx, ["c"], "~+")).toEqual(["a"]);
  });

  test("~- selects previous sibling and loops", () => {
    expect(dq.querySelector(ctx, ["b"], "~-")).toEqual(["a"]);
    expect(dq.querySelector(ctx, ["a"], "~-")).toEqual(["c"]);
  });
});
