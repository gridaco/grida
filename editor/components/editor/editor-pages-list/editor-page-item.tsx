import React from "react";
import { FileIcon } from "@radix-ui/react-icons";
import styled from "@emotion/styled";
import { useTheme } from "@emotion/react";
import { TreeView } from "@editor-ui/hierarchy";

export function EditorPageItem({
  id,
  name,
  selected,
  onPress,
}: {
  id: string;
  name: string;
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
      icon={<FileIcon color={selected ? iconSelectedColor : iconColor} />}
    >
      {name}
    </TreeView.Row>
  );
}
