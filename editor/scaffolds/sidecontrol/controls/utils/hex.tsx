import React from "react";
import {
  useHexValueInput,
  type RGB,
  type RGBA,
} from "@grida/number-input/react";

export default function HexValueInput<T extends RGB | RGBA>({
  className,
  value,
  onValueChange,
  disabled,
}: React.HtmlHTMLAttributes<HTMLInputElement> & {
  value: T;
  onValueChange?: (color: T) => void;
  disabled?: boolean;
}) {
  const { inputRef, hex, handleKeyDown, handleChange, handleFocus } =
    useHexValueInput<T>({ value, onValueChange });

  return (
    <input
      ref={inputRef}
      className={className}
      value={hex}
      onKeyDown={handleKeyDown}
      onChange={handleChange}
      onFocus={handleFocus}
      spellCheck={false}
      disabled={disabled}
    />
  );
}
