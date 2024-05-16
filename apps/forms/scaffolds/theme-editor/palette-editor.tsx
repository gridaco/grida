import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import React, { use, useEffect, useState } from "react";
import { HslColorPicker } from "react-colorful";
import { z } from "zod";
import type { Palette, Theme } from "@/theme/palettes/types";
import * as palettes from "@/theme/palettes";
import clsx from "clsx";
import { MoonIcon, SunIcon } from "@radix-ui/react-icons";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function ThemePalette({
  initialTheme,
  onValueChange,
  onDarkChange,
}: {
  initialTheme?: z.infer<typeof Theme>;
  onValueChange?: (theme: z.infer<typeof Theme>) => void;
  onDarkChange?: (dark: boolean) => void;
}) {
  const [mode, setMode] = useState<"light" | "dark">("light");
  const [presetId, setPresetId] = useState<string>("blue");
  const [theme, setTheme] = useState<z.infer<typeof Theme>>(
    // @ts-ignore
    palettes[presetId]
  );

  useEffect(() => {
    onValueChange?.(theme);
  }, [onValueChange, theme]);

  useEffect(() => {
    onDarkChange?.(mode === "dark");
  }, [onDarkChange, mode]);

  return (
    <Card className="w-full h-full">
      <CardHeader>
        <header className="flex flex-col items-start gap-3">
          <div className="flex flex-wrap gap-2">
            {Object.keys(palettes).map((key) => {
              // @ts-ignore
              const palette = palettes[key];
              const primary = palette[mode]["--primary"];
              return (
                <button
                  key={key}
                  data-selected={key === presetId}
                  onClick={() => {
                    setPresetId(key);
                    setTheme(palette);
                  }}
                  className={clsx(
                    "w-6 h-6 border-2 rounded-full",
                    "data-[selected='true']:border-white"
                  )}
                  style={{
                    backgroundColor: `hsl(${primary.h}, ${primary.s}%, ${primary.l}%)`,
                  }}
                />
              );
            })}
          </div>
          <ToggleGroup
            type="single"
            value={mode}
            defaultValue="light"
            onValueChange={(v) => v && setMode(v as any)}
          >
            <ToggleGroupItem value="light">
              <SunIcon />
            </ToggleGroupItem>
            <ToggleGroupItem value="dark">
              <MoonIcon />
            </ToggleGroupItem>
          </ToggleGroup>
        </header>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2">
          {Object.entries(theme[mode]).map(([key, value]) => (
            <li className="flex items-center gap-2" key={key}>
              <ColorChip
                id={key}
                value={value as any}
                onChange={(value) => {
                  setTheme((prev) => ({
                    ...prev,
                    [mode]: {
                      ...prev[mode],
                      [key]: value,
                    },
                  }));
                }}
              />
              <label htmlFor={key} className="font-mono text-sm opacity-50">
                {key}
              </label>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function ColorChip({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: {
    h: number;
    s: number;
    l: number;
  };
  onChange?: (value: { h: number; s: number; l: number }) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger id={id}>
        <div
          className="w-6 h-6 border-2 rounded-full"
          style={{
            backgroundColor: `hsl(${value.h}, ${value.s}%, ${value.l}%)`,
          }}
        />
      </PopoverTrigger>
      <PopoverContent className="w-full">
        <HslColorPicker className="w-full" color={value} onChange={onChange} />
      </PopoverContent>
    </Popover>
  );
}
