import { ReflectSceneNode } from "@design-sdk/figma";
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

export function flattenNodeTree(
  root: ReflectSceneNode,
  selections: string[],
  expands: string[]
): FlattenedDisplayItemNode<ReflectSceneNode>[] {
  const flattened: FlattenedDisplayItemNode<ReflectSceneNode>[] = [];

  visit<ReflectSceneNode>(root, {
    getChildren: (layer) => {
      if (expands.includes(layer.id)) {
        return layer.children;
      }
      return [];
    },

    onEnter(layer, indexPath) {
      flattened.push({
        id: layer.id,
        name: layer.name,
        parent: layer.parent?.id,
        depth: indexPath.length - 1,
        expanded:
          layer.children.length <= 0
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
