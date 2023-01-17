import React, { useCallback, useEffect, useMemo, useState } from "react";
import { TreeView } from "@editor-ui/editor";
import {
  LayerRow,
  IconContainer,
  LayerIcon,
} from "./editor-layer-hierarchy-item";
import {
  FigmaReflectRepository,
  useEditorState,
  useWorkspace,
} from "core/states";
import { useDispatch } from "core/dispatch";
import {
  flattenNodeTree,
  FlattenedDisplayItemNode,
} from "./editor-layer-heriarchy-controller";
import type { ReflectSceneNode } from "@design-sdk/figma-node";

// TODO:
// - add navigate context menu
// - add go to main component
// - add reveal and focus to selected layers

/**
 *
 * @param props.rootNodeIDs - root node ids to display @default: null
 * @param props.expandAll - expand all nodes by default @default: false
 * @returns
 */
export function DesignLayerHierarchy({
  rootNodeIDs = null,
  expandAll = false,
}: {
  rootNodeIDs?: string[];
  expandAll?: boolean;
}) {
  const [state] = useEditorState();
  const { selectedNodes, selectedPage, design } = state;
  const { highlightLayer, highlightedLayer } = useWorkspace();
  const dispatch = useDispatch();

  const [expands, setExpands] = useState<string[]>(state?.selectedNodes ?? []);

  // get the root nodes (if the rootNodeIDs is not specified, use the selected page's children)
  let roots: ReflectSceneNode[] = [];
  if (rootNodeIDs?.length > 0) {
    roots = rootNodeIDs.reduce((acc, item) => {
      acc.push(findUnder(item, design));
      return acc;
    }, []);
  } else {
    roots = selectedPage
      ? design.pages.find((p) => p.id == selectedPage).children
      : [design?.input?.entry];
  }

  const layers: FlattenedDisplayItemNode[][] = useMemo(() => {
    return roots
      ? roots
          .filter(Boolean)
          .map((layer) => flattenNodeTree(layer, selectedNodes, expands))
      : [];
  }, [roots, state?.selectedNodes, expands]);

  useEffect(() => {
    if (expandAll) {
      const ids = layers.reduce((acc, item) => {
        acc.push(...item.map((i) => i.id));
        return acc;
      }, [] as string[]);
      setExpands(ids);
    }
  }, [layers, expandAll]);

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
          key={id}
          id={id}
          icon={
            <IconContainer>
              <LayerIcon type={data.origin} selected={selected} />
            </IconContainer>
          }
          name={name}
          depth={depth + 1} // because the root is not a layer. it's the page, the array of roots.
          expanded={expanded}
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
          menuItems={[]}
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
  //
}

/**
 * This only supports root frame at the moment.
 * partof: nodeQ
 * @param node
 * @param design
 * @returns
 */
function findUnder(node: string, design: FigmaReflectRepository) {
  for (const page of design.pages) {
    for (const frame of page.children.filter(Boolean)) {
      if (frame.id === node) {
        return frame;
      }
    }
  }
}
