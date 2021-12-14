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
import {
  flattenNodeTree,
  FlattenedDisplayItemNode,
} from "./editor-layer-heriarchy-controller";

export function EditorLayerHierarchy() {
  const [state] = useEditorState();
  const dispatch = useDispatch();

  const [expands, setExpands] = useState<string[]>(state?.selectedNodes ?? []);

  const root = state.selectedPage
    ? state.design.pages.find((p) => p.id == state.selectedPage).children
    : [state.design?.input?.entry];

  const layers: FlattenedDisplayItemNode[][] = useMemo(() => {
    return root
      ? root
          .filter((l) => !!l)
          .map((layer) => flattenNodeTree(layer, state.selectedNodes, expands))
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
      // const _haschildren = useMemo(() => haschildren(id), [id, depth]);
      // const _haschildren = haschildren(id);

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
    [dispatch, state?.selectedNodes, layers, expands]
  );

  // const haschildren = useCallback(
  //   (id: string) => {
  //     return layers.some((l) => l.some((layer) => layer.parent === id));
  //   },
  //   [layers]
  // );

  return (
    <TreeView.Root
      data={layers.flat()}
      keyExtractor={useCallback((item: any) => item.id, [])}
      renderItem={renderItem}
    />
  );
}
