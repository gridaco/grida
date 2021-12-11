import React, { memo, useCallback, useMemo, useReducer, useState } from "react";
import styled from "@emotion/styled";
import { TreeView } from "@editor-ui/editor";
import {
  LayerRow,
  IconContainer,
  LayerIcon,
} from "./editor-layer-hierarchy-item";
import { useEditorState } from "core/states";
import { useDispatch } from "core/dispatch";

export function EditorLayerHierarchy() {
  const [state] = useEditorState();
  const dispatch = useDispatch();
  const root = state.selectedPage
    ? state.design.pages.find((p) => p.id == state.selectedPage).children
    : [state.design?.input?.entry];

  const layers: FlattenedNode[][] = root
    ? root.filter((l) => !!l).map((layer) => flatten(layer))
    : [];

  const renderItem = useCallback(
    ({ id, name, depth, type }) => {
      const selected = state?.selectedNodes?.includes(id);

      return (
        <LayerRow
          icon={
            <IconContainer>
              <LayerIcon type={type} selected={selected} />
            </IconContainer>
          }
          name={name}
          depth={depth}
          id={id}
          expanded={haschildren(id) == true ? true : undefined}
          key={id}
          selected={selected}
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

  const haschildren = useCallback(
    (id: string) => {
      return layers.some((l) => l.some((layer) => layer.parent === id));
    },
    [layers]
  );

  return (
    <TreeView.Root
      data={layers.flat()}
      keyExtractor={useCallback((item: any) => item.id, [])}
      renderItem={renderItem}
    />
  );
}

interface ITreeNode {
  id: string;
  name: string;
  type: string;
  children?: ITreeNode[];
}

interface FlattenedNode {
  id: string;
  name: string;
  depth: number;
  type: string;
  parent: string;
}

const flatten = <T extends ITreeNode>(
  tree: T,
  parent?: string,
  depth: number = 0
): FlattenedNode[] => {
  const convert = (node: T, depth: number, parent?: string) => {
    if (!node) {
      return;
    }

    const result: FlattenedNode = {
      id: node.id,
      name: node.name,
      type: node.type,
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
