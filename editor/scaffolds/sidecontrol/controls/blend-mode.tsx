import React from "react";
import { TMixed } from "./utils/types";
import { enumEq, enumLabel, EnumItem, PropertyEnum, enumValue } from "../ui";
import { BlendModeIcon } from "@/grida-canvas-react-starter-kit/starterkit-icons";
import type cg from "@grida/cg";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui-editor/button";

export const items: EnumItem<cg.BlendMode>[] = [
  {
    value: "normal",
    label: "Normal",
  },
  {
    value: "multiply",
    label: "Multiply",
  },
  {
    value: "screen",
    label: "Screen",
  },
  {
    value: "overlay",
    label: "Overlay",
  },
  {
    value: "darken",
    label: "Darken",
  },
  {
    value: "lighten",
    label: "Lighten",
  },
  {
    value: "color-dodge",
    label: "Color Dodge",
  },
  {
    value: "color-burn",
    label: "Color Burn",
  },
  {
    value: "hard-light",
    label: "Hard Light",
  },
  {
    value: "soft-light",
    label: "Soft Light",
  },
  {
    value: "difference",
    label: "Difference",
  },
  {
    value: "exclusion",
    label: "Exclusion",
  },
  {
    value: "hue",
    label: "Hue",
  },
  {
    value: "saturation",
    label: "Saturation",
  },
  {
    value: "color",
    label: "Color",
  },
  {
    value: "luminosity",
    label: "Luminosity",
  },
];

export function BlendModeSelect({
  value = "normal",
  onValueChange,
}: {
  value?: TMixed<cg.BlendMode>;
  onValueChange?: (value: cg.BlendMode) => void;
}) {
  return (
    <PropertyEnum<cg.BlendMode>
      enum={items}
      value={value}
      onValueChange={onValueChange}
    />
  );
}

export function BlendModeDropdown({
  value = "normal",
  onValueChange,
}: {
  value?: TMixed<cg.BlendMode>;
  onValueChange?: (value: cg.BlendMode) => void;
}) {
  const activevalue = !!value && value !== "normal";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild tabIndex={-1}>
        <Button variant="ghost" size="xs">
          <BlendModeIcon active={activevalue} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent collisionPadding={16}>
        {items.map((item, i) => (
          <DropdownMenuCheckboxItem
            checked={enumEq(value as any, item)}
            key={i}
            className="text-xs"
            onCheckedChange={(checked) => {
              if (checked) {
                onValueChange?.(enumValue(item));
              }
            }}
          >
            {enumLabel(item)}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
