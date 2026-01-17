export type FlatItem = { id: string; isFolder: boolean };

export type TreeNode = {
  id: string;
  parent_id: string | null;
  children: TreeNode[];
};

/**
 * 1-depth nesting: each folder collects only its immediate following items.
 *
 * @returns {TreeNode[]} Tree structure with folders and their immediate children.
 * @example
 * ```ts
 * const items: FlatItem[] = [
 *   { id: "1", isFolder: true },
 *   { id: "2", isFolder: false },
 *   { id: "3", isFolder: false },
 * ];
 * const tree = depth1(items);
 * // [
 * //   {
 * //     id: "1",
 * //     parent_id: null,
 * //     children: [
 * //       { id: "2", parent_id: "1", children: [] },
 * //       { id: "3", parent_id: "1", children: [] },
 * //     ],
 * //   },
 * // ]
 * ```
 */
export function depth1(items: FlatItem[]): TreeNode[] {
  const roots: TreeNode[] = [];
  let current: TreeNode | null = null;

  for (const it of items) {
    if (it.isFolder) {
      const folder: TreeNode = { id: it.id, parent_id: null, children: [] };
      roots.push(folder);
      current = folder;
    } else {
      const leaf: TreeNode = {
        id: it.id,
        parent_id: current ? current.id : null,
        children: [],
      };
      if (current) current.children.push(leaf);
      else roots.push(leaf);
    }
  }

  return roots;
}

export function flat(items: TreeNode[]): Omit<TreeNode, "children">[] {
  return items.flatMap((item) => {
    const { children, ...props } = item;
    return [{ ...props }, ...flat(children)];
  });
}

/**
 * Fully nested: every folder nests under the last seen folder.
 *
 * @returns {TreeNode[]} Fully nested tree structure.
 * @example
 * ```ts
 * const items: FlatItem[] = [
 *   { id: "a", isFolder: true },
 *   { id: "b", isFolder: true },
 *   { id: "c", isFolder: false },
 * ];
 * const tree = tree(items);
 * // [
 * //   {
 * //     id: "a",
 * //     parent_id: null,
 * //     children: [
 * //       {
 * //         id: "b",
 * //         parent_id: "a",
 * //         children: [
 * //           { id: "c", parent_id: "b", children: [] },
 * //         ],
 * //       },
 * //     ],
 * //   },
 * // ]
 * ```
 */
export function tree(items: FlatItem[]): TreeNode[] {
  const roots: TreeNode[] = [];
  const stack: TreeNode[] = [];

  for (const it of items) {
    if (it.isFolder) {
      const parentId = stack.length > 0 ? stack[stack.length - 1].id : null;
      const folder: TreeNode = { id: it.id, parent_id: parentId, children: [] };
      if (stack.length === 0) roots.push(folder);
      else stack[stack.length - 1].children.push(folder);
      stack.push(folder);
    } else {
      const parentId = stack.length > 0 ? stack[stack.length - 1].id : null;
      const leaf: TreeNode = { id: it.id, parent_id: parentId, children: [] };
      if (stack.length > 0) stack[stack.length - 1].children.push(leaf);
      else roots.push(leaf);
    }
  }

  return roots;
}
