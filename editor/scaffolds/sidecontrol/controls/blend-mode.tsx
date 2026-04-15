import React, { useCallback } from "react";
import { TMixed } from "./utils/types";
import { enumEq, enumLabel, EnumItem, enumValue } from "../ui";
import { BlendModeIcon } from "@/grida-canvas-react-starter-kit/starterkit-icons";
import type cg from "@grida/cg";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui-editor/button";
import { usePropertyPreview } from "@/grida-canvas-react/hooks/use-property-change";

const items_blend_mode: EnumItem<cg.BlendMode>[] = [
  {
    value: "normal",
    label: "Normal",
    group: "1",
  },
  {
    value: "darken",
    label: "Darken",
    group: "2",
  },
  {
    value: "multiply",
    label: "Multiply",
    group: "2",
  },
  //
  {
    value: "lighten",
    label: "Lighten",
    group: "3",
  },
  {
    value: "screen",
    label: "Screen",
    group: "3",
  },
  {
    value: "color-dodge",
    label: "Color Dodge",
    group: "3",
  },
  //
  {
    value: "overlay",
    label: "Overlay",
    group: "4",
  },
  {
    value: "color-burn",
    label: "Color Burn",
    group: "4",
  },
  {
    value: "hard-light",
    label: "Hard Light",
    group: "4",
  },
  {
    value: "soft-light",
    label: "Soft Light",
    group: "4",
  },
  //
  {
    value: "difference",
    label: "Difference",
    group: "5",
  },
  {
    value: "exclusion",
    label: "Exclusion",
    group: "5",
  },
  //
  {
    value: "hue",
    label: "Hue",
    group: "6",
  },
  {
    value: "saturation",
    label: "Saturation",
    group: "6",
  },
  {
    value: "color",
    label: "Color",
    group: "6",
  },
  {
    value: "luminosity",
    label: "Luminosity",
    group: "6",
  },
];

const items_layer_blend_mode: EnumItem<cg.LayerBlendMode>[] = [
  {
    value: "pass-through",
    label: "Pass Through",
    group: "1",
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
  /**
   * Called when the dropdown opens — start a preview session.
   */
  onPreviewStart?: () => void;
  /**
   * Called on hover — apply tentative value for preview.
   */
  onPreviewChange?: (
    value: T extends "paint" ? cg.BlendMode : cg.LayerBlendMode
  ) => void;
  /**
   * Called when dropdown closes — commit or discard the preview.
   * @param committed true if a value was selected, false if closed without selection
   */
  onPreviewEnd?: (committed: boolean) => void;
}

export function BlendModeDropdown({
  type,
  value = type === "layer" ? "pass-through" : "normal",
  onValueChange,
  onPreviewStart,
  onPreviewChange,
  onPreviewEnd,
}: Props<"paint" | "layer">) {
  const isNonDefault =
    !!value && value !== (type === "layer" ? "pass-through" : "normal");

  // Type cast based on the type prop
  const items = type === "layer" ? items_layer_blend_mode : items_blend_mode;
  const typedValue =
    type === "layer"
      ? (value as TMixed<cg.LayerBlendMode>)
      : (value as TMixed<cg.BlendMode>);

  // Group items by their group property
  const groupedItems = items.reduce(
    (groups, item) => {
      const group =
        typeof item === "string" ? "default" : item.group || "default";
      if (!groups[group]) {
        groups[group] = [];
      }
      groups[group].push(item);
      return groups;
    },
    {} as Record<string, typeof items>
  );

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        onPreviewStart?.();
      } else {
        // Dropdown closed without explicit selection — discard preview
        onPreviewEnd?.(false);
      }
    },
    [onPreviewStart, onPreviewEnd]
  );

  return (
    <DropdownMenu modal={false} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild tabIndex={-1}>
        <Button variant="ghost" size="icon">
          <BlendModeIcon active={isNonDefault} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent collisionPadding={16}>
        {Object.entries(groupedItems).map(
          ([groupKey, groupItems], groupIndex) => (
            <React.Fragment key={groupKey}>
              {groupIndex > 0 && <DropdownMenuSeparator />}
              {groupItems.map((item, itemIndex) => (
                <DropdownMenuCheckboxItem
                  key={`${groupKey}-${itemIndex}`}
                  // oxlint-disable-next-line typescript-eslint/no-explicit-any -- enum value comparison
                  checked={enumEq(typedValue as any, item)}
                  className="text-xs"
                  onPointerEnter={() => {
                    onPreviewChange?.(enumValue(item));
                  }}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      onValueChange?.(enumValue(item));
                      onPreviewEnd?.(true);
                    }
                  }}
                >
                  {enumLabel(item)}
                </DropdownMenuCheckboxItem>
              ))}
            </React.Fragment>
          )
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * BlendModeDropdown with history preview support.
 * Uses `usePropertyPreview` hook — hover previews blend mode changes
 * without polluting the undo stack.
 */
export function BlendModeDropdownWithPreview(
  props: Omit<
    Props<"paint" | "layer">,
    "onPreviewStart" | "onPreviewChange" | "onPreviewEnd"
  >
) {
  type BM = cg.BlendMode | cg.LayerBlendMode;
  const preview = usePropertyPreview<BM>("blend-mode", (v) => {
    props.onValueChange?.(v);
  });

  // While previewing, show checkmark on the committed value
  const displayValue = preview.committedValue ?? props.value;

  return (
    <BlendModeDropdown
      {...props}
      value={displayValue}
      onPreviewStart={() => {
        const v = props.value;
        const fallback = props.type === "layer" ? "pass-through" : "normal";
        const committed = (v && typeof v === "string" ? v : fallback) as BM;
        preview.onOpen(committed);
      }}
      onPreviewChange={(v) => {
        preview.onSeek(v);
      }}
      onPreviewEnd={(committed) => {
        if (committed) {
          preview.onCommit();
        } else {
          preview.onClose();
        }
      }}
    />
  );
}
