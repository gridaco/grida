import { bench, describe } from "vitest";
import {
  createDrag,
  disallowDescendant,
  flattenForRender,
  RowsSnapshot,
  TreeController,
  type NodeId,
} from "..";
import { buildLarge } from "../__tests__/_helpers";

function expandAll(
  controller: TreeController,
  src: ReturnType<typeof buildLarge>
) {
  const ids: NodeId[] = [];
  const root = src.getRoot();
  const walk = (id: NodeId) => {
    const node = src.getNode(id);
    if (node.children.length > 0 && id !== root) ids.push(id);
    for (const c of node.children) walk(c);
  };
  walk(root);
  controller.setExpanded(ids);
}

describe("flattenForRender", () => {
  const sizes: Array<[number, number, number]> = [
    [10, 3, 1110],
    [10, 4, 11110],
    [10, 5, 111110],
  ];
  for (const [per, depth, _expected] of sizes) {
    const src = buildLarge(per, depth);
    const expanded = new Set<NodeId>();
    const root = src.getRoot();
    const walk = (id: NodeId) => {
      const node = src.getNode(id);
      if (node.children.length > 0 && id !== root) expanded.add(id);
      for (const c of node.children) walk(c);
    };
    walk(root);
    bench(`flatten ${per}^${depth}`, () => {
      flattenForRender(src, expanded);
    });
  }
});

describe("RowsSnapshot cache", () => {
  const src = buildLarge(10, 4);
  const ctrl = new TreeController({ source: src });
  expandAll(ctrl, src);
  // Warm
  ctrl.getRows();
  bench("getRows() cached", () => {
    ctrl.getRows();
  });

  const snap = new RowsSnapshot();
  const expanded = new Set<NodeId>(ctrl.getExpanded());
  snap.get(src, expanded, 1, {});
  bench("RowsSnapshot.get() cached", () => {
    snap.get(src, expanded, 1, {});
  });
});

describe("drag resolve", () => {
  const src = buildLarge(10, 4);
  const handle = createDrag({
    source: src,
    items: ["n0"],
    constraint: disallowDescendant(),
  });
  bench("over() resolve", () => {
    handle.over("n100", "into");
  });
});
