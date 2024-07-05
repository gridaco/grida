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
import { Input } from "@/components/ui/input";

export function ThemePalette({
  dark: _dark,
  value,
  preset,
  onPresetChange,
  onValueChange,
  onDarkChange,
}: {
  dark?: boolean;
  preset?: string;
  value: z.infer<typeof Theme>;
  onPresetChange?: (preset: string) => void;
  onValueChange?: (theme: z.infer<typeof Theme>) => void;
  onDarkChange?: (dark: boolean) => void;
}) {
  const [isdark, setisdark] = useState<boolean>(_dark ?? false);
  const colorscheme = isdark ? "dark" : "light";
  const [presetId, setPresetId] = useState<string>("blue");

  useEffect(() => {
    onDarkChange?.(isdark);
  }, [onDarkChange, isdark]);

  return (
    <Card className="w-full h-full">
      <CardHeader>
        <header className="flex flex-col items-start gap-3">
          <div className="flex flex-wrap gap-2">
            {Object.keys(palettes).map((key) => {
              // @ts-ignore
              const palette = palettes[key];
              const primary = palette[colorscheme]["--primary"];
              return (
                <button
                  key={key}
                  data-selected={key === presetId}
                  onClick={() => {
                    setPresetId(key);
                    onPresetChange?.(key);
                  }}
                  className={clsx(
                    "w-6 h-6 border-2 rounded-full",
                    "data-[selected='true']:outline data-[selected='true']:outline-foreground data-[selected='true']:border-background"
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
            value={colorscheme}
            defaultValue="light"
            onValueChange={(v) => v && setisdark(v === "dark")}
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
        <ul className="flex flex-col gap-2 font-mono">
          {Object.entries(value[colorscheme]).map(([k, v]) => {
            const type = typeof v;

            switch (type) {
              // casted to hsl
              case "object": {
                return (
                  <li className="flex items-center gap-2" key={k}>
                    <ColorChip
                      id={k}
                      value={v as any}
                      onChange={(v) => {
                        onValueChange?.({
                          ...value,
                          [colorscheme]: {
                            ...value[colorscheme],
                            [k]: v,
                          },
                        });
                      }}
                    />
                    <label htmlFor={k} className="font-mono text-sm opacity-50">
                      {k}
                    </label>
                  </li>
                );
              }
              case "string": {
                return (
                  <li key={k}>
                    <label className="font-mono text-sm opacity-50" htmlFor={k}>
                      {k}
                    </label>
                    <Input
                      id={k}
                      value={v as string}
                      onChange={(e) => {
                        onValueChange?.({
                          ...value,
                          [colorscheme]: {
                            ...value[colorscheme],
                            [k]: e.target.value,
                          },
                        });
                      }}
                    />
                  </li>
                );
              }
            }
          })}
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
