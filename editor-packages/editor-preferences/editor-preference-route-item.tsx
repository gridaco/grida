import React, { useCallback } from "react";
import styled from "@emotion/styled";
import { useTheme } from "@emotion/react";
import { TreeView } from "@editor-ui/hierarchy";
import type { PreferenceRouteInfo } from "./core";

export function EditorPreferenceRouteItem({
  id,
  name,
  selected,
  onPress,
}: PreferenceRouteInfo & {
  selected: boolean;
  onPress: () => void;
}) {
  const { icon: iconColor, iconSelected: iconSelectedColor } =
    useTheme().colors;

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
    >
      {name}
    </TreeView.Row>
  );
}
