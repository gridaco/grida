import React, { useMemo } from "react";
import { TreeView } from "@editor-ui/hierarchy";
import {
  IconContainer,
  PageIcon,
  PageMenuItemType,
  PageRow,
} from "../side-navigation-page-hierarchy/page-navigation-item";
import "@editor-ui/theme";
import * as ContextMenu from "@editor-ui/context-menu";
import "@editor-ui/theme";

import { PageType } from "./page-type";

type PageListItem = {
  id: string;
  type: PageType;
  name: string;
  depth: number;
  expanded: boolean;
  selected: boolean;
  visible: boolean;
};

export function SideNavigationPagesHierarchy() {
  const selectedPages = [];
  const highlightPage = {};
  const pages: PageListItem[] = [
    {
      id: "",
      name: "Page 1",
      depth: 0,
      type: "page",
      expanded: true,
      selected: true,
      visible: true,
    },
    {
      id: "",
      name: "Page 2",
      depth: 0,
      type: "page",
      expanded: true,
      selected: false,
      visible: true,
    },
  ]; //useDeepArray(flattenLayerList(page, selectedObjects));
  const menuItems: ContextMenu.MenuItem<PageMenuItemType>[] = [
    {
      value: "delete",
      title: "delete",
    },
  ];
  // const [menuItems, onSelectMenuItem] = useLayerMenu(selectedLayers);

  const layerElements = useMemo(() => {
    return pages.map(
      ({ id, name, depth, type, expanded, selected, visible }, index) => {
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

        const handleClickChevron = () => {
          console.log("handleClickChevron");
        };

        const isSymbolClass =
          type === "symbolInstance" || type === "symbolMaster";
        const isArtboardClass = type === "artboard" || type === "symbolMaster";
        const isGroupClass = isArtboardClass || type === "group";

        return (
          <PageRow
            menuItems={menuItems}
            onSelectMenuItem={onSelectMenuItem}
            onContextMenu={handleContextMenu}
            key={id}
            name={name}
            depth={depth}
            selected={selected}
            onClick={handleClick}
            onHoverChange={handleHoverChange}
            icon={
              <IconContainer>
                <PageIcon
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
    pages,
    menuItems,
    // onSelectMenuItem,
    // dispatch,
    // selectedObjects,
    highlightPage,
  ]);

  return (
    <TreeView.Root
      scrollable
      onClick={
        undefined
        //   useCallback(
        //   [dispatch]
        // )
      }
    >
      {layerElements}
    </TreeView.Root>
  );
}
