import React from "react";
import { WorkbenchUI } from "@/components/workbench";
import { RGBAChip } from "./utils/paint-chip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/components/lib/utils";
import { ColorPicker } from "./color-picker";
import HexValueInput from "./utils/hex";

type RGBA = { r: number; g: number; b: number; a: number };

export type RGBAColorControlProps = {
  value: RGBA;
  onValueChange?: (value: RGBA) => void;
};

export function RGBAColorControl({
  value = { r: 0, g: 0, b: 0, a: 0 },
  onValueChange,
  disabled,
}: {
  value?: RGBA;
  disabled?: boolean;
  onValueChange?: (value: RGBA) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = React.useState(false);

  const handleContainerClick = React.useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const handleContainerPointerDown = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        inputRef.current?.focus();
      }
    },
    []
  );

  const handleInputFocus = React.useCallback(() => {
    setIsFocused(true);
  }, []);

  const handleInputBlur = React.useCallback(() => {
    setIsFocused(false);
  }, []);

  return (
    <Popover modal={false}>
      <div
        className={cn(
          "flex items-center border cursor-default",
          WorkbenchUI.inputVariants({
            size: "xs",
            variant: "paint-container",
          })
        )}
        data-focus={isFocused}
        onClick={handleContainerClick}
        onPointerDown={handleContainerPointerDown}
        tabIndex={-1}
      >
        <PopoverTrigger disabled={disabled} className="flex-shrink-0">
          <RGBAChip rgba={value} className="rounded-sm" />
        </PopoverTrigger>

        <HexValueInput
          ref={inputRef}
          className="flex-1 ps-1.5"
          disabled={disabled}
          value={{
            r: value.r,
            g: value.g,
            b: value.b,
          }}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onValueChange={(color) => {
            onValueChange?.({
              ...color,
              a: value.a,
            });
          }}
        />
      </div>
      <PopoverContent
        align="start"
        side="right"
        sideOffset={16}
        className="p-0"
      >
        <ColorPicker color={value} onColorChange={onValueChange} />
      </PopoverContent>
    </Popover>
  );
}
