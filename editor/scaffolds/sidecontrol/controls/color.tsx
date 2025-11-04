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
import { useNumberInput } from "@grida/number-input/react";
import { InputGroup, InputGroupAddon } from "@/components/ui/input-group";
import { Separator } from "@/components/ui/separator";

type RGBA = { r: number; g: number; b: number; a: number };

export type RGBAColorControlProps = {
  value: RGBA;
  onValueChange?: (value: RGBA) => void;
  variant?: "default" | "with-opacity";
};

function InlineOpacityControl({
  value,
  onValueCommit,
  onFocus,
  onBlur,
}: {
  value?: number;
  onValueCommit?: (value: number) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  const {
    internalValue,
    inputType,
    handleFocus,
    handleBlur,
    handleKeyDown,
    handleChange,
    inputRef,
  } = useNumberInput({
    type: "number",
    value,
    step: 0.01,
    autoSelect: true,
    min: 0,
    max: 1,
    mode: "fixed",
    onValueCommit,
    commitOnBlur: true,
    suffix: "%",
    scale: 100,
  });

  return (
    <input
      ref={inputRef}
      type={inputType}
      placeholder="<opacity>"
      value={internalValue}
      onChange={handleChange}
      onClick={(e) => {
        // Prevent InputGroupAddon's onClick from focusing the hex input
        e.stopPropagation();
      }}
      onFocus={(e) => {
        handleFocus(e, onFocus);
      }}
      onBlur={(e) => {
        handleBlur(e, onBlur);
      }}
      onKeyDown={handleKeyDown}
      className="
        w-12 appearance-none ps-1.5 text-xs
        placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground
        bg-transparent outline-none
      "
    />
  );
}

export function RGBAColorControl({
  value = { r: 0, g: 0, b: 0, a: 0 },
  onValueChange,
  disabled,
  variant = "default",
}: {
  value?: RGBA;
  disabled?: boolean;
  onValueChange?: (value: RGBA) => void;
  variant?: "default" | "with-opacity";
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = React.useState(false);

  const handleInputFocus = React.useCallback(() => {
    setIsFocused(true);
  }, []);

  const handleInputBlur = React.useCallback(() => {
    setIsFocused(false);
  }, []);

  return (
    <Popover modal={false}>
      <InputGroup
        className={cn(
          WorkbenchUI.inputVariants({
            size: "xs",
            variant: "paint-container",
          })
        )}
        data-focus={isFocused}
      >
        <InputGroupAddon align="inline-start" className="px-1.5">
          <PopoverTrigger disabled={disabled}>
            <RGBAChip rgba={value} className="rounded-sm" />
          </PopoverTrigger>
        </InputGroupAddon>

        <HexValueInput
          ref={inputRef}
          className="flex-1 !px-0"
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

        {variant === "with-opacity" && (
          <>
            <Separator orientation="vertical" />
            <InputGroupAddon align="inline-end">
              <InlineOpacityControl
                value={value.a}
                onValueCommit={(opacity) => {
                  onValueChange?.({
                    ...value,
                    a: opacity,
                  });
                }}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
              />
            </InputGroupAddon>
          </>
        )}
      </InputGroup>
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
