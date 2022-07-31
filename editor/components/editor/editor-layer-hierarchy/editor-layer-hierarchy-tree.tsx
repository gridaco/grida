import React, { memo, useCallback, useMemo, useReducer, useState } from "react";
import styled from "@emotion/styled";
import { TreeView } from "@editor-ui/editor";
import {
  LayerRow,
  IconContainer,
  LayerIcon,
} from "./editor-layer-hierarchy-item";
import { useEditorState, useWorkspace } from "core/states";
import { useDispatch } from "core/dispatch";
import {
  flattenNodeTree,
  FlattenedDisplayItemNode,
} from "./editor-layer-heriarchy-controller";

// TODO:
// - add navigate context menu
// - add go to main component
// - add reveal on select

export function EditorLayerHierarchy() {
  const [state] = useEditorState();
  const { highlightLayer, highlightedLayer } = useWorkspace();
  const dispatch = useDispatch();

  const { selectedNodes, selectedPage, design } = state;

  const [expands, setExpands] = useState<string[]>(state?.selectedNodes ?? []);

  const root = selectedPage
    ? design.pages.find((p) => p.id == selectedPage).children
    : [design?.input?.entry];

  const layers: FlattenedDisplayItemNode[][] = useMemo(() => {
    return root
      ? root
          .filter(Boolean)
          .map((layer) => flattenNodeTree(layer, selectedNodes, expands))
      : [];
  }, [root, state?.selectedNodes, expands]);

  const renderItem = useCallback(
    ({
      id,
      name,
      expanded,
      selected,
      depth,
      data,
    }: FlattenedDisplayItemNode) => {
      const hovered = highlightedLayer === id;

      return (
        <LayerRow
          icon={
            <IconContainer>
              <LayerIcon type={data.origin} selected={selected} />
            </IconContainer>
          }
          name={name}
          depth={depth + 1} // because the root is not a layer. it's the page, the array of roots.
          id={id}
          expanded={expanded}
          key={id}
          selected={selected}
          onClickChevron={() => {
            if (expands.includes(id)) {
              setExpands(expands.filter((e) => e !== id));
            } else {
              setExpands([...expands, id]);
            }
          }}
          onHoverChange={(hovered) => {
            highlightLayer(hovered ? id : undefined);
          }}
          hovered={hovered}
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
    [dispatch, selectedNodes, layers, expands, highlightedLayer]
  );

  return (
    <TreeView.Root
      data={layers.flat()}
      keyExtractor={useCallback((item: any) => item.id, [])}
      renderItem={renderItem}
    />
  );
}
