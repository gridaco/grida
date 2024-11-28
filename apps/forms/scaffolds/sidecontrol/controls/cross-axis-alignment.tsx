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
import { grida } from "@/grida";

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
  horizontal: iconsbyaxis.vertical,
  vertical: iconsbyaxis.horizontal,
};

export function CrossAxisAlignmentControl({
  value,
  direction = "horizontal",
  onValueChange,
}: {
  value: grida.program.cg.CrossAxisAlignment;
  direction?: grida.program.cg.Axis;
  onValueChange?: (value: grida.program.cg.CrossAxisAlignment) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      id="align-items"
      value={value}
      onValueChange={(v) => {
        if (!v) return;
        onValueChange?.(v as grida.program.cg.CrossAxisAlignment);
      }}
    >
      <ToggleGroupItem
        value={"start" satisfies grida.program.cg.CrossAxisAlignment}
      >
        {React.createElement(icons[direction || "horizontal"].start)}
      </ToggleGroupItem>
      <ToggleGroupItem
        value={"center" satisfies grida.program.cg.CrossAxisAlignment}
      >
        {React.createElement(icons[direction || "horizontal"].center)}
      </ToggleGroupItem>
      <ToggleGroupItem
        value={"end" satisfies grida.program.cg.CrossAxisAlignment}
      >
        {React.createElement(icons[direction || "horizontal"].end)}
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
