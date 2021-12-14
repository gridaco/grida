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
import { flatten, FlattenedNode } from "./editor-layer-heriarchy-controller";

export function EditorLayerHierarchy() {
  const [state] = useEditorState();
  const dispatch = useDispatch();
  const root = state.selectedPage
    ? state.design.pages.find((p) => p.id == state.selectedPage).children
    : [state.design?.input?.entry];

  const layers: FlattenedNode[][] = useMemo(() => {
    return root ? root.filter((l) => !!l).map((layer) => flatten(layer)) : [];
  }, [root]);

  const renderItem = useCallback(
    ({ id, name, depth, type, origin }) => {
      const selected = state?.selectedNodes?.includes(id);
      // const _haschildren = useMemo(() => haschildren(id), [id, depth]);
      // const _haschildren = haschildren(id);

      return (
        <LayerRow
          icon={
            <IconContainer>
              <LayerIcon type={origin} selected={selected} />
            </IconContainer>
          }
          name={name}
          depth={depth}
          id={id}
          // expanded={_haschildren == true ? true : undefined}
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
    [dispatch, state?.selectedNodes, layers]
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
