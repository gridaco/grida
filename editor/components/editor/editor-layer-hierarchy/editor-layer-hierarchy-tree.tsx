import React, { memo, useCallback, useMemo, useState } from "react";

import styled from "@emotion/styled";
import { TreeView } from "@editor-ui/editor";
import { ListView } from "@editor-ui/listview";
import { LayerRow } from "./editor-layer-hierarchy-item";
import { useEditorState } from "core/states";

export function EditorLayerHierarchy() {
  const [state] = useEditorState();
  const root = state.design?.current?.entry;
  const layers = root ? flatten(root) : [];
  const [selected, setSelected] = useState<string | null>(null);

  const renderItem = useCallback(
    ({ id, name, depth }) => {
      return (
        <LayerRow
          name={name}
          depth={depth}
          id={id}
          expanded={haschildren(id) == true ? true : undefined}
          key={id}
          selected={selected == id}
          onAddClick={() => {}}
          onMenuClick={() => {}}
          onDoubleClick={() => {}}
          onPress={() => {
            setSelected(id);
          }}
          onSelectMenuItem={() => {}}
          onContextMenu={() => {}}
        />
      );
    },
    [selected]
  );

  const haschildren = useCallback((id: string) => {
    return layers.some((layer) => layer.parent === id);
  }, []);

  return (
    <TreeView.Root
      data={layers}
      keyExtractor={useCallback((item: any) => item.id, [])}
      renderItem={renderItem}
    />
  );
}

interface ITreeNode {
  id: string;
  name: string;
  children?: ITreeNode[];
}

interface FlattenedNode {
  id: string;
  name: string;
  depth: number;
  parent: string;
}

const flatten = (
  tree: ITreeNode,
  parent?: string,
  depth: number = 0
): FlattenedNode[] => {
  const convert = (node: ITreeNode, depth: number, parent?: string) => {
    const result: FlattenedNode = {
      id: node.id,
      name: node.name,
      depth: depth,
      parent,
    };
    return result;
  };

  const final = [];
  final.push(convert(tree, depth, parent));
  for (const child of tree.children || []) {
    final.push(...flatten(child, tree.id, depth + 1));
  }
  return final;
};
