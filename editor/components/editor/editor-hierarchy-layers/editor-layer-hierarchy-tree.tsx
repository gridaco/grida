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
import type { IVirtualizedList } from "@editor-ui/listview";
import useMeasure from "react-use-measure";
import { p } from "@tree-/q";

// TODO:
// - add navigate context menu
// - add go to main component
// - add expand and focus to selected layers
//    - ✅ expand
//    - ✅ focus (scroll to)
//    - 🚫 expand & focus (scroll to)

function useAutoFocus({
  ref,
  layers,
  targets,
}: {
  ref: React.RefObject<IVirtualizedList>;
  targets: string[];
  layers: FlattenedDisplayItemNode[][];
}) {
  useEffect(() => {
    // auto focus to selection
    const focusnode = targets[0];
    if (focusnode) {
      const index = layers.flat().findIndex((i) => i.id == focusnode);
      if (index) {
        ref.current?.scrollToIndex(index);
      }
    }
  }, [ref, targets]);
}

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
  const [sizeRef, { height, width }] = useMeasure({
    debounce: { scroll: 100, resize: 100 },
  });
  const [state] = useEditorState();
  const { selectedNodes, selectedPage, design } = state;
  const { highlightLayer, highlightedLayer } = useWorkspace();
  const dispatch = useDispatch();

  const [expands, setExpands] = useState<string[]>(state?.selectedNodes ?? []);

  const ref = React.useRef<IVirtualizedList>(null);

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

  useAutoFocus({
    ref,
    layers,
    targets: selectedNodes,
  });

  // exapnd all nodes
  useEffect(() => {
    if (expandAll) {
      const ids = layers.reduce((acc, item) => {
        acc.push(...item.map((i) => i.id));
        return acc;
      }, [] as string[]);
      setExpands(ids);
    }
  }, [layers, expandAll]);

  // automatically expand the selected nodes' parents
  useEffect(() => {
    const newexpands = [];

    // loop through all roots
    for (const child of roots) {
      // if the node contains the selected node, add to expands.
      selectedNodes.forEach((id) => {
        const path = p(id, { data: child });
        if (path.length > 0) {
          newexpands.push(...path);
        }
      });
    }

    setExpands(
      Array.from(new Set([...expands, ...newexpands])).filter(Boolean)
    );
  }, [selectedNodes]);

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
    <div
      style={{
        width: "100%",
        height: "100%",
      }}
      ref={sizeRef}
    >
      <TreeView.Root
        ref={ref}
        data={layers.flat()}
        keyExtractor={useCallback((item: any) => item.id, [])}
        renderItem={renderItem}
        scrollable
        expandable
        virtualized={{
          width: width,
          height: height,
        }}
      />
    </div>
  );
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
