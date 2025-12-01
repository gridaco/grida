import React from "react";
import {
  useHexValueInput,
  type RGB,
  type RGBUnit,
} from "@grida/number-input/react";
import { WorkbenchUI } from "@/components/workbench";
import { cn } from "@/components/lib/utils";

type HexValueInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange"
> & {
  value: RGB;
  unit?: RGBUnit;
  onValueChange?: (color: RGB) => void;
};

function RGBHexInputInner(
  {
    className,
    value,
    unit = "u8",
    onValueChange,
    onFocus,
    ...props
  }: HexValueInputProps,
  ref: React.Ref<HTMLInputElement>
) {
  const { inputRef, hex, handleKeyDown, handleChange, handleFocus } =
    useHexValueInput({ value, unit, onValueChange });

  const mergeRefs = React.useCallback(
    (node: HTMLInputElement) => {
      inputRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        (ref as React.RefObject<HTMLInputElement | null>).current = node;
      }
    },
    [ref, inputRef]
  );

  return (
    <input
      {...props}
      ref={mergeRefs}
      className={cn(WorkbenchUI.rawInputVariants({ size: "xs" }), className)}
      value={hex}
      onKeyDown={handleKeyDown}
      onChange={handleChange}
      onFocus={(e) => {
        handleFocus();
        onFocus?.(e);
      }}
      spellCheck={false}
    />
  );
}

const RGBHexInput = React.forwardRef(RGBHexInputInner);

export default RGBHexInput;
