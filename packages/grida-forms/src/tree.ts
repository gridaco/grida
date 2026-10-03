import type { FormBlockType, FormBlock } from "./model";

export interface FormBlockTree<A = FormBlock[]> {
  depth: number;
  children: A;
}

const folder_types = new Set(["section", "group"]);

type WithChildren<T> = T & { children: T[] };

/**
 * does not multi-level nesting only 1 level
 * this is used on client side, where the actual rendering is done by nested components
 */
export function blockstree<
  T extends {
    id: string;
    type: FormBlockType;
    parent_id?: string | null;
    local_index: number;
  },
>(blocks: T[]): FormBlockTree<T[]> {
  const tree: FormBlockTree<T[]> = {
    depth: 0,
    children: [],
  };

  const folders: WithChildren<T>[] = blocks
    .filter((block) => folder_types.has(block.type))
    .sort((a, b) => a.local_index - b.local_index)
    .map((block) => ({
      ...block,
      children: [],
    }));

  const items = blocks
    .filter((block) => !folder_types.has(block.type))
    .sort((a, b) => a.local_index - b.local_index);

  // assign folders to tree if any
  if (folders.length > 0) {
    tree.children = folders;
    tree.depth = 1;
  } else {
    tree.children = items;
    return tree;
  }

  // groupby parent_id, sort by local_index
  const grouped = items.reduce(
    (acc, block) => {
      const parent_id = block.parent_id || "root";
      if (!acc[parent_id]) {
        acc[parent_id] = [];
      }
      acc[parent_id].push(block);
      return acc;
    },
    {} as Record<string, T[]>
  );

  for (const folder of folders) {
    const children = grouped[folder.id] || [];
    folder.children = children;
  }

  return tree;
}
