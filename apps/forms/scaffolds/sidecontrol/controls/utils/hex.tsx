import React, { useRef, useState, useEffect } from "react";

type RGB = { r: number; g: number; b: number };
type RGBA = { r: number; g: number; b: number; a: number };

export default function HexValueInput<T extends RGB | RGBA>({
  className,
  value: initialValue,
  onValueChange,
}: React.HtmlHTMLAttributes<HTMLInputElement> & {
  value: T;
  onValueChange?: (color: T) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState<T>(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const rgbToHex = (color: T): string => {
    const r = color.r.toString(16).padStart(2, "0");
    const g = color.g.toString(16).padStart(2, "0");
    const b = color.b.toString(16).padStart(2, "0");
    const a =
      "a" in color
        ? Math.round(color.a * 255)
            .toString(16)
            .padStart(2, "0")
        : "";
    return `${r}${g}${b}${a}`.toUpperCase();
  };

  const hexToRgb = (hex: string): T | null => {
    if (!/^([0-9A-F]{6}|[0-9A-F]{8})$/i.test(hex)) return null;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a =
      hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : undefined;
    return a !== undefined ? ({ r, g, b, a } as T) : ({ r, g, b } as T);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const selectionStart = inputRef.current?.selectionStart || 0;
    const selectionEnd = inputRef.current?.selectionEnd || 0;
    const direction = e.key === "ArrowUp" ? 1 : e.key === "ArrowDown" ? -1 : 0;
    const step = e.shiftKey ? 10 : 1;

    if (!direction) return;
    e.preventDefault();

    // Calculate the affected channels based on the selection range
    const affectedChannels: Array<keyof T> = [];
    if (selectionStart < 2 && selectionEnd > 0) affectedChannels.push("r");
    if (selectionStart < 4 && selectionEnd > 2) affectedChannels.push("g");
    if (selectionStart < 6 && selectionEnd > 4) affectedChannels.push("b");
    if ("a" in value && selectionStart < 8 && selectionEnd > 6)
      affectedChannels.push("a" as keyof T);

    // Update values for all affected channels
    const updatedValue = { ...value };
    affectedChannels.forEach((key) => {
      const max = key === "a" ? 1 : 255;
      const min = 0;
      const currentValue = value[key] as number;
      const newValue = Math.min(
        max,
        Math.max(min, currentValue + step * direction)
      );
      // @ts-expect-error
      updatedValue[key] = newValue;
    });

    setValue(updatedValue);
    onValueChange?.(updatedValue);

    // Adjust selection range dynamically for the affected channels
    const start = Math.min(
      ...affectedChannels.map((key) =>
        key === "r" ? 0 : key === "g" ? 2 : key === "b" ? 4 : 6
      )
    );
    const end = Math.max(
      ...affectedChannels.map((key) =>
        key === "r" ? 2 : key === "g" ? 4 : key === "b" ? 6 : 8
      )
    );

    requestAnimationFrame(() => {
      if (inputRef.current) inputRef.current.setSelectionRange(start, end);
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const hex = e.target.value.toUpperCase();
    const parsedValue = hexToRgb(hex);
    if (parsedValue) {
      setValue(parsedValue);
      onValueChange?.(parsedValue);
    }
  };

  const handleFocus = () => {
    if (inputRef.current) {
      inputRef.current.setSelectionRange(0, rgbToHex(value).length);
    }
  };

  return (
    <input
      ref={inputRef}
      className={className}
      value={rgbToHex(value)}
      onKeyDown={handleKeyDown}
      onChange={handleChange}
      onFocus={handleFocus}
      spellCheck={false}
    />
  );
}
