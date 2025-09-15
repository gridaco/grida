import React from "react";
import {
  useHexValueInput,
  type RGB,
  type RGBA,
} from "@grida/number-input/react";
import { WorkbenchUI } from "@/components/workbench";
import { cn } from "@/components/lib/utils";

type HexValueInputProps<T extends RGB | RGBA> = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange"
> & {
  value: T;
  onValueChange?: (color: T) => void;
};

function HexValueInputInner<T extends RGB | RGBA>(
  { className, value, onValueChange, onFocus, ...props }: HexValueInputProps<T>,
  ref: React.Ref<HTMLInputElement>
) {
  const { inputRef, hex, handleKeyDown, handleChange, handleFocus } =
    useHexValueInput<T>({ value, onValueChange });

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

const HexValueInput = React.forwardRef(HexValueInputInner);

export default HexValueInput;
