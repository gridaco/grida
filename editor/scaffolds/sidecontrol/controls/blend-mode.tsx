import React from "react";
import { TMixed } from "./utils/types";
import { enumEq, enumLabel, EnumItem, PropertyEnum, enumValue } from "../ui";
import { BlendModeIcon } from "@/grida-canvas-react-starter-kit/starterkit-icons";
import type cg from "@grida/cg";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui-editor/button";

const items_blend_mode: EnumItem<cg.BlendMode>[] = [
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

const items_layer_blend_mode: EnumItem<cg.LayerBlendMode>[] = [
  {
    value: "pass-through",
    label: "Pass Through",
  },
  ...items_blend_mode,
];

// Generic interface for type-safe props
interface Props<T extends "paint" | "layer"> {
  type: T;
  value?: TMixed<T extends "paint" ? cg.BlendMode : cg.LayerBlendMode>;
  onValueChange?: (
    value: T extends "paint" ? cg.BlendMode : cg.LayerBlendMode
  ) => void;
}

export function BlendModeDropdown({
  type,
  value = type === "layer" ? "pass-through" : "normal",
  onValueChange,
}: Props<"paint" | "layer">) {
  const isNonDefault =
    !!value && value !== (type === "layer" ? "pass-through" : "normal");

  // Type cast based on the type prop
  const items = type === "layer" ? items_layer_blend_mode : items_blend_mode;
  const typedValue =
    type === "layer"
      ? (value as TMixed<cg.LayerBlendMode>)
      : (value as TMixed<cg.BlendMode>);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild tabIndex={-1}>
        <Button variant="ghost" size="xs">
          <BlendModeIcon active={isNonDefault} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent collisionPadding={16}>
        {items.map((item, i) => (
          <DropdownMenuCheckboxItem
            onSeeked={console.log}
            checked={enumEq(typedValue as any, item)}
            key={i}
            className="text-xs"
            // FIXME: temporary hack. we don't yet have preview system
            onPointerEnter={() => {
              onValueChange?.(enumValue(item));
            }}
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
