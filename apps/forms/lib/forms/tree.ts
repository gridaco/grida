import type { EditorFlatFormBlock } from "@/scaffolds/editor/state";
import type { FormBlockTree, FormBlockTreeFolderBlock } from "./types";

const folder_types = ["section", "group"];

/**
 * does not multi-level nesting only 1 level
 * this is used on client side, where the actual rendering is done by nested components
 */
export function blockstree(blocks: EditorFlatFormBlock[]): FormBlockTree {
  const tree: FormBlockTree = {
    depth: 0,
    children: [],
  };

  const folders: FormBlockTreeFolderBlock[] = blocks
    .filter((block) => folder_types.includes(block.type))
    .sort((a, b) => a.local_index - b.local_index)
    .map((block) => ({
      ...block,
      children: [],
    })) as FormBlockTreeFolderBlock[];

  const items = blocks
    .filter((block) => !folder_types.includes(block.type))
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
    {} as Record<string, EditorFlatFormBlock[]>
  );

  for (const folder of folders) {
    const children = grouped[folder.id] || [];
    folder.children = children;
  }

  return tree;
}

/**
 * sort blocks by hierarchy, but without actual nesting.
 * this is used on editor side, where the items should be flat for drag and drop
 */
export function blockstreeflat(
  blocks: EditorFlatFormBlock[]
): EditorFlatFormBlock[] {
  const folder_types = ["section", "group"];
  const result: EditorFlatFormBlock[] = [];

  // First, separate folder blocks and item blocks
  const folders: EditorFlatFormBlock[] = blocks.filter((block) =>
    folder_types.includes(block.type)
  );
  const items: EditorFlatFormBlock[] = blocks.filter(
    (block) => !folder_types.includes(block.type)
  );

  // Sort folders by their local_index to maintain the hierarchy order
  folders.sort((a, b) => a.local_index - b.local_index);

  // Organize items by their parent_id
  const itemsByParentId: Record<string, EditorFlatFormBlock[]> = items.reduce(
    (acc: any, item) => {
      const parentId = item.parent_id || "root";
      if (!acc[parentId]) {
        acc[parentId] = [];
      }
      acc[parentId].push(item);
      return acc;
    },
    {}
  );

  // For each folder, add it to the result array and then add its children sorted by local_index
  folders.forEach((folder) => {
    result.push(folder);
    const children = itemsByParentId[folder.id] || [];
    children.sort((a, b) => a.local_index - b.local_index);
    result.push(...children);
  });

  // Add root items (items without a parent_id or with a non-existent parent_id) at the end, sorted by local_index
  const rootItems = itemsByParentId["root"] || [];
  rootItems.sort((a, b) => a.local_index - b.local_index);
  result.push(...rootItems);

  return result;
}
