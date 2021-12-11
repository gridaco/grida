import { ReflectSceneNode } from "@design-sdk/figma-node";

export const find_node_by_id_under_entry = (
  id: string,
  entry: ReflectSceneNode
): ReflectSceneNode => {
  if (!entry) return null;
  if (entry.id === id) {
    return entry;
  }
  if (entry.children) {
    for (const child of entry.children) {
      const found = find_node_by_id_under_entry(id, child);
      if (found) {
        return found;
      }
    }
  }
  return null;
};

export const find_node_by_id_under_inpage_nodes = (
  id: string,
  nodes: ReflectSceneNode[]
): ReflectSceneNode => {
  return nodes?.find((node) => {
    return find_node_by_id_under_entry(id, node);
  });
};
