import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import React, { useEffect, useState } from "react";
import { HslColorPicker } from "react-colorful";
import { z } from "zod";
import type { Theme } from "./types";
import { defaultTheme } from "./k";

export function ThemePalette({
  initialTheme,
  onValueChange,
}: {
  initialTheme?: z.infer<typeof Theme>;
  onValueChange?: (theme: z.infer<typeof Theme>) => void;
}) {
  const [theme, setTheme] = useState<z.infer<typeof Theme>>(defaultTheme);

  useEffect(() => {
    onValueChange?.(theme);
  }, [onValueChange, theme]);

  return (
    <div className="w-full h-full">
      <ul className="flex flex-col gap-2">
        {Object.entries(theme).map(([key, value]) => (
          <li className="flex items-center gap-2" key={key}>
            <ColorChip
              value={value as any}
              onChange={(value) => {
                setTheme((prev) => ({
                  ...prev,
                  [key]: value,
                }));
              }}
            />
            <label>{key}</label>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ColorChip({
  value,
  onChange,
}: {
  value: {
    h: number;
    s: number;
    l: number;
  };
  onChange?: (value: { h: number; s: number; l: number }) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger>
        <div className="">
          <div
            className="w-6 h-6 border-2 rounded-full"
            style={{
              backgroundColor: `hsl(${value.h}, ${value.s}%, ${value.l}%)`,
            }}
          />
        </div>
      </PopoverTrigger>
      <PopoverContent>
        <HslColorPicker
          color={value}
          onChange={onChange}
          className="w-24 h-24"
        />
      </PopoverContent>
    </Popover>
  );
}
