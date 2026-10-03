import type { EditorFlatFormBlock } from "@/scaffolds/editor/state";
export { blockstree } from "@grida/forms";

/**
 * sort blocks by hierarchy, but without actual nesting.
 * this is used on editor side, where the items should be flat for drag and drop
 */
export function blockstreeflat(
  blocks: EditorFlatFormBlock[]
): EditorFlatFormBlock[] {
  const folder_types_local = new Set(["section", "group"]);
  const result: EditorFlatFormBlock[] = [];

  // First, separate folder blocks and item blocks
  const folders: EditorFlatFormBlock[] = blocks.filter((block) =>
    folder_types_local.has(block.type)
  );
  const items: EditorFlatFormBlock[] = blocks.filter(
    (block) => !folder_types_local.has(block.type)
  );

  // Sort folders by their local_index to maintain the hierarchy order
  folders.sort((a, b) => a.local_index - b.local_index);

  // Organize items by their parent_id
  const itemsByParentId: Record<string, EditorFlatFormBlock[]> = items.reduce(
    (acc: Record<string, EditorFlatFormBlock[]>, item) => {
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
