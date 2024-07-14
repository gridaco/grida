import React from "react";
import { ToggleGroup, ToggleGroupItem } from "./utils/toggle-group";
import {
  AlignLeftIcon,
  AlignRightIcon,
  AlignCenterHorizontallyIcon,
  AlignTopIcon,
  AlignCenterVerticallyIcon,
  AlignBottomIcon,
} from "@radix-ui/react-icons";

const iconsbyaxis = {
  vertical: {
    start: AlignTopIcon,
    center: AlignCenterVerticallyIcon,
    end: AlignBottomIcon,
  },
  horizontal: {
    start: AlignLeftIcon,
    center: AlignCenterHorizontallyIcon,
    end: AlignRightIcon,
  },
};

const icons = {
  row: iconsbyaxis.vertical,
  "row-reverse": iconsbyaxis.vertical,
  column: iconsbyaxis.horizontal,
  "column-reverse": iconsbyaxis.horizontal,
};

type AlignItems = "start" | "center" | "end";

export function AlignItemsControl({
  value,
  flexDirection = "row",
  onValueChange,
}: {
  value?: AlignItems;
  flexDirection?: "row" | "column";
  onValueChange?: (value: AlignItems) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      id="align-items"
      value={value}
      onValueChange={onValueChange}
    >
      <ToggleGroupItem value="start">
        {React.createElement(icons[flexDirection ?? "row"].start)}
      </ToggleGroupItem>
      <ToggleGroupItem value="center">
        {React.createElement(icons[flexDirection ?? "row"].center)}
      </ToggleGroupItem>
      <ToggleGroupItem value="end">
        {React.createElement(icons[flexDirection ?? "row"].end)}
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
