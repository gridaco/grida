import React, { useCallback } from "react";
import { FigmaLogoIcon, HomeIcon, CodeIcon } from "@radix-ui/react-icons";
import styled from "@emotion/styled";
import { useTheme } from "@emotion/react";
import { TreeView } from "@editor-ui/hierarchy";
import { EditorPage } from "core/states";

export function EditorPageItem({
  id,
  name,
  type,
  selected,
  onPress,
}: EditorPage & {
  selected: boolean;
  onPress: () => void;
}) {
  const { icon: iconColor, iconSelected: iconSelectedColor } =
    useTheme().colors;

  const iconRenderer = (type: EditorPage["type"]) => {
    const props = { color: selected ? iconSelectedColor : iconColor };
    switch (type) {
      case "home":
        return <HomeIcon {...props} />;
      case "code":
        return <CodeIcon {...props} />;
      case "figma-canvas":
        return <FigmaLogoIcon {...props} />;
      default:
        return <></>;
    }
  };

  return (
    <TreeView.Row
      depth={0}
      id={id}
      key={id}
      sortable={false}
      selected={selected}
      selectedColor={"rgba(255, 255, 255, 0.1)"}
      onPress={onPress}
      onDoubleClick={() => {}}
      icon={iconRenderer(type)}
    >
      {name}
    </TreeView.Row>
  );
}
