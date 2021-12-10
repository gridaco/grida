import React, { memo, useCallback, useMemo, useReducer, useState } from "react";

import styled from "@emotion/styled";
import { TreeView } from "@editor-ui/editor";
import { LayerRow } from "./editor-layer-hierarchy-item";
import { useEditorState } from "core/states";
import { useDispatch } from "core/dispatch";

export function EditorLayerHierarchy() {
  const [state] = useEditorState();
  const dispatch = useDispatch();
  const root = state.design?.current?.entry;
  const layers = root ? flatten(root) : [];

  const renderItem = useCallback(
    ({ id, name, depth }) => {
      return (
        <LayerRow
          name={name}
          depth={depth}
          id={id}
          expanded={haschildren(id) == true ? true : undefined}
          key={id}
          selected={state?.selectedNodes?.includes(id)}
          onAddClick={() => {}}
          onMenuClick={() => {}}
          onDoubleClick={() => {}}
          onPress={() => {
            dispatch({ type: "select-node", node: id });
          }}
          onSelectMenuItem={() => {}}
          onContextMenu={() => {}}
        />
      );
    },
    [state?.selectedNodes]
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
