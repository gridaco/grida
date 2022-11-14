import React from "react";
import { SelectItemCard } from "./select-item-card";
import { FigmaLogoIcon, ImageIcon } from "@radix-ui/react-icons";
import { Html5Icon } from "@code-editor/module-icons";

export function CanvasModeSelectItem({
  mode,
  label,
  selected = false,
  onClick,
}: {
  mode: "bitmap-renderer" | "figma-renderer" | "vanilla-renderer";
  selected?: boolean;
  label: string;
  onClick?: () => void;
}) {
  return (
    <SelectItemCard selected={selected} onClick={onClick}>
      <div className="preview-container">
        <CanvasModeIcon mode={mode} />
      </div>
      <label>{label}</label>
    </SelectItemCard>
  );
}

function CanvasModeIcon({
  mode,
}: {
  mode: "bitmap-renderer" | "figma-renderer" | "vanilla-renderer";
}) {
  const props = {
    color: "white",
    size: 36,
    width: 36,
    height: 36,
  };

  switch (mode) {
    case "bitmap-renderer": {
      return <ImageIcon {...props} />;
    }
    case "figma-renderer": {
      return <FigmaLogoIcon {...props} />;
    }
    case "vanilla-renderer": {
      return <Html5Icon {...props} />;
    }
  }
}
