import { InMemoryTreeSource, type TreeNode } from "..";

/**
 * Build a small fixture tree:
 *
 *   <root>
 *     ├── a (container)
 *     │   ├── a1
 *     │   └── a2
 *     ├── b (container, empty)
 *     └── c (leaf)
 */
export function buildFixture(): InMemoryTreeSource<{
  kind: "leaf" | "folder";
}> {
  const nodes: TreeNode<{ kind: "leaf" | "folder" }>[] = [
    {
      id: "<root>",
      parent: null,
      children: ["a", "b", "c"],
      meta: { kind: "folder" },
    },
    {
      id: "a",
      parent: "<root>",
      children: ["a1", "a2"],
      meta: { kind: "folder" },
    },
    { id: "a1", parent: "a", children: [], meta: { kind: "leaf" } },
    { id: "a2", parent: "a", children: [], meta: { kind: "leaf" } },
    { id: "b", parent: "<root>", children: [], meta: { kind: "folder" } },
    { id: "c", parent: "<root>", children: [], meta: { kind: "leaf" } },
  ];
  return new InMemoryTreeSource({ root: "<root>", nodes, showRoot: false });
}

export function buildLinear(depth: number): InMemoryTreeSource {
  const nodes: TreeNode[] = [];
  nodes.push({ id: "<root>", parent: null, children: ["n0"] });
  for (let i = 0; i < depth; i++) {
    nodes.push({
      id: `n${i}`,
      parent: i === 0 ? "<root>" : `n${i - 1}`,
      children: i === depth - 1 ? [] : [`n${i + 1}`],
    });
  }
  return new InMemoryTreeSource({
    root: "<root>",
    nodes,
    showRoot: false,
  });
}

export function buildLarge(
  perLevel: number,
  depth: number
): InMemoryTreeSource {
  const nodes: TreeNode[] = [];
  const root: TreeNode = { id: "<root>", parent: null, children: [] };
  nodes.push(root);
  let id = 0;
  const allocChildren = (parent: TreeNode, levelsLeft: number): void => {
    if (levelsLeft <= 0) return;
    const children: string[] = [];
    for (let i = 0; i < perLevel; i++) {
      const cid = `n${id++}`;
      const child: TreeNode = { id: cid, parent: parent.id, children: [] };
      nodes.push(child);
      children.push(cid);
      allocChildren(child, levelsLeft - 1);
    }
    // Mutate via unknown cast — fixture builder, not runtime API.
    (parent as unknown as { children: string[] }).children = children;
  };
  allocChildren(root, depth);
  return new InMemoryTreeSource({ root: "<root>", nodes, showRoot: false });
}
