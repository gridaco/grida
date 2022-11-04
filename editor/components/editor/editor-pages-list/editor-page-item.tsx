import React, { useCallback } from "react";
import { FileIcon, HomeIcon } from "@radix-ui/react-icons";
import styled from "@emotion/styled";
import { useTheme } from "@emotion/react";
import { TreeView } from "@editor-ui/hierarchy";
import type { PageInfo } from "./editor-pages-list";

export function EditorPageItem({
  id,
  name,
  type,
  selected,
  onPress,
}: PageInfo & {
  selected: boolean;
  onPress: () => void;
}) {
  const { icon: iconColor, iconSelected: iconSelectedColor } =
    useTheme().colors;

  const iconRenderer = (type: PageInfo["type"]) => {
    switch (type) {
      case "home":
        return <HomeIcon color={selected ? iconSelectedColor : iconColor} />;
      case "assets":
      case "canvas":
      case "components":
      case "styles":
      default:
        return <FileIcon color={selected ? iconSelectedColor : iconColor} />;
    }
  };

  return (
    <TreeView.Row
      depth={0}
      id={id}
      key={id}
      sortable={false}
      selected={selected}
      selectedColor={"#494949"}
      onPress={onPress}
      onDoubleClick={() => {}}
      icon={iconRenderer(type)}
    >
      {name}
    </TreeView.Row>
  );
}
