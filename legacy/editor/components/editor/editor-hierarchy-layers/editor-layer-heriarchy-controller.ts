import type { ReflectSceneNode } from "@design-sdk/figma-node";
import { visit } from "tree-visit";

export interface ITreeNode<T = any> {
  id: string;
  name: string;
  children?: ITreeNode[];
  data?: T;
}

export interface FlattenedDisplayItemNode<T = any> {
  id: string;
  name: string;
  depth: number;
  parent: string;
  expanded?: boolean | undefined;
  selected?: boolean;
  data?: T;
}

export const flatten = <T extends ITreeNode>(
  tree: T,
  parent?: string,
  depth: number = 0
): FlattenedDisplayItemNode[] => {
  const convert = (node: T, depth: number, parent?: string) => {
    if (!node) {
      return;
    }

    const result: FlattenedDisplayItemNode = {
      ...node,
      depth: depth,
      parent,
    };

    return result;
  };

  const final = [];
  final.push(convert(tree, depth, parent));
  for (const child of tree?.children || []) {
    final.push(...flatten(child, tree.id, depth + 1));
  }
  return final;
};

export interface HierarchyTreeNode<T extends HierarchyTreeNode = any> {
  id: string;
  name: string;
  children?: T[];
  parent?: T;
}

export function flattenNodeTree<T extends HierarchyTreeNode>(
  root: T,
  selections: string[],
  expands: string[]
): FlattenedDisplayItemNode<T>[] {
  const flattened: FlattenedDisplayItemNode<T>[] = [];

  visit<T>(root, {
    getChildren: (layer): T[] => {
      if (expands.includes(layer.id)) {
        return layer.children ?? [];
      }
      return [];
    },

    onEnter(layer, indexPath) {
      flattened.push({
        id: layer.id,
        name: layer.name,
        parent: layer.parent?.id,
        depth: indexPath ? indexPath.length - 1 : 0,
        expanded:
          (layer.children?.length ?? 0) <= 0
            ? undefined
            : expands.includes(layer.id)
            ? true
            : false,
        selected: selections.includes(layer.id),
        data: layer,
      });
    },
  });

  return flattened;
}
