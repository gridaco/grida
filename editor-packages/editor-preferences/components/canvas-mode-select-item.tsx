import React from "react";
import { SelectItemCard } from "./select-item-card";

export function CanvasModeSelectItem({
  mode,
  label,
  preview,
  selected = false,
  onClick,
}: {
  mode: "bitmap-renderer" | "figma-renderer" | "vanilla-renderer";
  selected?: boolean;
  label: string;
  preview: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <SelectItemCard selected={selected} onClick={onClick}>
      <div className="preview-container">{preview}</div>
      <label>{label}</label>
    </SelectItemCard>
  );
}
