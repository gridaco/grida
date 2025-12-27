import React from "react";
import { WorkbenchUI } from "@/components/workbench";
import { RGBChip } from "./utils/paint-chip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/components/lib/utils";
import { ColorPicker32FWithOptions } from "./color-picker";
import RGBHexInput from "./utils/hex";
import { useNumberInput } from "@grida/number-input/react";
import { InputGroup, InputGroupAddon } from "@/components/ui/input-group";
import { Separator } from "@/components/ui/separator";
import kolor from "@grida/color";

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

export function RGBA32FColorControl({
  value = kolor.colorformats.RGBA32F.TRANSPARENT,
  onValueChange,
  disabled,
  variant = "default",
}: {
  value?: kolor.colorformats.RGBA32F;
  disabled?: boolean;
  onValueChange?: (value: kolor.colorformats.RGBA32F) => void;
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
            <RGBChip
              rgb={value}
              unit="f32"
              opacity={value.a}
              className="rounded-sm"
            />
          </PopoverTrigger>
        </InputGroupAddon>
        <RGBHexInput
          ref={inputRef}
          unit="f32"
          className="flex-1 !px-0"
          disabled={disabled}
          value={{
            r: value.r,
            g: value.g,
            b: value.b,
          }}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onValueCommit={(color, opacity) => {
            onValueChange?.(
              kolor.colorformats.newRGBA32F(
                color.r,
                color.g,
                color.b,
                opacity ?? value.a
              )
            );
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
        <ColorPicker32FWithOptions
          color={value}
          onColorChange={onValueChange}
        />
      </PopoverContent>
    </Popover>
  );
}
