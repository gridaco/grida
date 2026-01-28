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
  fuzz?: boolean;
  onValueChange?: (hex: string) => void;
  onValueCommit?: (rgb: RGB, opacity?: number) => void;
};

function RGBHexInputInner(
  {
    className,
    value,
    unit = "u8",
    fuzz,
    onValueChange,
    onValueCommit,
    onFocus,
    onBlur,
    ...props
  }: HexValueInputProps,
  ref: React.Ref<HTMLInputElement>
) {
  const hexInput = useHexValueInput({
    value,
    unit,
    fuzz,
    onValueChange,
    onValueCommit,
  });

  const { ref: inputRef, ...inputProps } = hexInput;

  React.useImperativeHandle(ref, () => inputRef.current!, [inputRef]);

  return (
    <input
      {...props}
      {...inputProps}
      ref={inputRef}
      className={cn(WorkbenchUI.rawInputVariants({ size: "xs" }), className)}
      onFocus={(e) => {
        hexInput.onFocus();
        onFocus?.(e);
      }}
      onBlur={(e) => {
        hexInput.onBlur();
        onBlur?.(e);
      }}
      spellCheck={false}
    />
  );
}

const RGBHexInput = React.forwardRef(RGBHexInputInner);

export default RGBHexInput;
