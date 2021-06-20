import React, { useMemo } from "react";
import { ArrowDownIcon, MaskOnIcon } from "@radix-ui/react-icons";
import { HierarchyData, TreeView } from "@editor-ui/hierarchy";
import { Spacer } from "@editor-ui/spacer";
import {
  IconContainer,
  LayerIcon,
  LayerMenuItemType,
  LayerRow,
} from "./page-navigation-item";
import "@editor-ui/theme";
import * as ContextMenu from "@editor-ui/context-menu";
import "@editor-ui/theme";

type LayerListItem = {
  // type: LayerType;
  id: string;
  name: string;
  depth: number;
  expanded: boolean;
  selected: boolean;
  visible: boolean;
  hasClippingMask: boolean;
  shouldBreakMaskChain: boolean;
  isWithinMaskChain: boolean;
  isLocked: boolean;
};

export function SideNavigationPagesHierarchySegment() {
  const selectedLayers = [];

  const highlightLayer = {};
  const items = [
    {
      id: "",
      name: "layer 1",
      depth: 0,
      type: "rectangle",
      expanded: true,
      selected: true,
      visible: true,
      isWithinMaskChain: false,
      hasClippingMask: false,
      isLocked: false,
    },
    {
      id: "",
      name: "layer 1",
      depth: 0,
      type: "rectangle",
      expanded: true,
      selected: false,
      visible: true,
      isWithinMaskChain: false,
      hasClippingMask: false,
      isLocked: false,
    },
  ]; //useDeepArray(flattenLayerList(page, selectedObjects));
  const menuItems: ContextMenu.MenuItem<LayerMenuItemType>[] = [
    {
      value: "delete",
      title: "delete",
    },
  ];
  // const [menuItems, onSelectMenuItem] = useLayerMenu(selectedLayers);

  const layerElements = useMemo(() => {
    return items.map(
      (
        {
          id,
          name,
          depth,
          type,
          expanded,
          selected,
          visible,
          isWithinMaskChain,
          hasClippingMask,
          isLocked,
        },
        index
      ) => {
        // const handleClick = (info: TreeView.TreeViewClickInfo) => {
        //   const { metaKey, shiftKey } = info;

        //   dispatch("interaction", ["reset"]);

        //   if (metaKey) {
        //     dispatch(
        //       "selectLayer",
        //       id,
        //       selectedObjects.includes(id) ? "difference" : "intersection"
        //     );
        //   } else if (shiftKey && selectedObjects.length > 0) {
        //     const lastSelectedIndex = items.findIndex(
        //       (item) => item.id === selectedObjects[selectedObjects.length - 1]
        //     );

        //     const first = Math.min(index, lastSelectedIndex);
        //     const last = Math.max(index, lastSelectedIndex) + 1;

        //     dispatch(
        //       "selectLayer",
        //       items.slice(first, last).map((item) => item.id),
        //       "intersection"
        //     );
        //   } else {
        //     dispatch("selectLayer", id, "replace");
        //   }
        // };

        // const handleHoverChange = (hovered: boolean) => {
        //   highlightLayer(
        //     hovered
        //       ? { id, precedence: "aboveSelection", isMeasured: false }
        //       : undefined
        //   );
        // };

        // const handleClickChevron = () =>
        //   dispatch("setExpandedInLayerList", id, !expanded);

        // const handleChangeVisible = (value: boolean) =>
        //   dispatch("setLayerVisible", id, value);

        // const handleChangeIsLocked = (value: boolean) =>
        //   dispatch("setLayerIsLocked", id, value);

        // const handleContextMenu = () => {
        //   if (selected) return;

        //   dispatch("selectLayer", id);
        // };

        const onSelectMenuItem = () => {
          console.log("onSelectMenuItem");
        };

        const handleContextMenu = () => {
          console.log("handleContextMenu");
        };

        const handleClick = () => {
          console.log("handleClick");
        };

        const handleHoverChange = () => {
          console.log("handleHoverChange");
        };

        const handleChangeVisible = () => {
          console.log("handleChangeVisible");
        };

        const handleChangeIsLocked = () => {
          console.log("handleChangeIsLocked");
        };

        const handleClickChevron = () => {
          console.log("handleClickChevron");
        };

        const isSymbolClass =
          type === "symbolInstance" || type === "symbolMaster";
        const isArtboardClass = type === "artboard" || type === "symbolMaster";
        const isGroupClass = isArtboardClass || type === "group";

        return (
          <LayerRow
            menuItems={menuItems}
            onSelectMenuItem={onSelectMenuItem}
            onContextMenu={handleContextMenu}
            key={id}
            name={name}
            visible={visible}
            isWithinMaskChain={isWithinMaskChain}
            isLocked={isLocked}
            depth={depth}
            selected={selected}
            onClick={handleClick}
            onHoverChange={handleHoverChange}
            onChangeVisible={handleChangeVisible}
            onChangeIsLocked={handleChangeIsLocked}
            icon={
              <IconContainer>
                {hasClippingMask ? (
                  <>
                    <MaskOnIcon />
                    <Spacer.Horizontal size={4} />
                  </>
                ) : isWithinMaskChain ? (
                  <>
                    <ArrowDownIcon />
                    <Spacer.Horizontal size={4} />
                  </>
                ) : null}
                <LayerIcon
                  type={type}
                  selected={selected}
                  variant={isSymbolClass ? "primary" : undefined}
                />
              </IconContainer>
            }
            isSectionHeader={isArtboardClass}
            expanded={isGroupClass ? expanded : undefined}
            onClickChevron={handleClickChevron}
          />
        );
      }
    );
  }, [
    items,
    menuItems,
    // onSelectMenuItem,
    // dispatch,
    // selectedObjects,
    highlightLayer,
  ]);

  return (
    <TreeView.Root
      scrollable
      onClick={
        undefined
        //   useCallback(
        //   () => dispatch("selectLayer", undefined),
        //   [dispatch]
        // )
      }
    >
      {layerElements}
    </TreeView.Root>
  );
}
