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
  const root = state.design?.current?.entry;
  const layers = root ? flatten(root, ["origin"]) : [];

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
      return layers.some((layer) => layer.parent === id);
    },
    [layers.length]
  );

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
  properties?: string[],
  parent?: string,
  depth: number = 0
): FlattenedNode[] => {
  const convert = (node: T, properties, depth: number, parent?: string) => {
    const result: FlattenedNode = {
      id: node.id,
      name: node.name,
      type: node.type,
      depth: depth,
      parent,
    };

    properties?.forEach((property) => {
      (result as object)[property] = node[property];
    });

    return result;
  };

  const final = [];
  final.push(convert(tree, properties, depth, parent));
  for (const child of tree.children || []) {
    final.push(...flatten(child, null, tree.id, depth + 1));
  }
  return final;
};
