import React, { useMemo, useState, useEffect } from "react";
import styled, { useTheme } from "@editor-ui/theme";
import { TreeView } from "@editor-ui/hierarchy";
import type { PreferenceRouteInfo } from "./core";
import { GearIcon } from "@radix-ui/react-icons";
export function EditorPreferenceRouteItem({
  route,
  name,
  selected,
  expanded,
  onPress,
  onExpandToggle,
  depth,
}: PreferenceRouteInfo & {
  expanded?: boolean;
  selected: boolean;
  onPress: () => void;
  depth: number;
  onExpandToggle?: () => void;
}) {
  const { icon: iconColor, iconSelected: iconSelectedColor } =
    useTheme().colors;

  return (
    <TreeView.Row
      depth={depth}
      icon={<GearIcon color={selected ? iconSelectedColor : iconColor} />}
      id={route}
      key={route}
      onClickChevron={onExpandToggle}
      expanded={expanded}
      sortable={false}
      selected={selected}
      selectedColor={"#494949"}
      onPress={onPress}
      onDoubleClick={() => {}}
    >
      {name}
    </TreeView.Row>
  );
}
