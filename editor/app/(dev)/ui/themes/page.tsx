"use client";
import React, { useState } from "react";
import { CardsDemo } from "@/grida-theme-shadcn/example/cards";
import { AgentThemeProvider } from "@/scaffolds/agent/theme";
import palettes from "@/theme/palettes";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

type PaletteKey = keyof typeof palettes;

const keys = Object.keys(palettes) as PaletteKey[];

export default function Preview() {
  const [palettekey, setPaletteKey] = useState<PaletteKey>("saturation_blue");

  return (
    <main className="p-10">
      <header>
        <Select
          value={palettekey}
          onValueChange={(v) => setPaletteKey(v as PaletteKey)}
        >
          <SelectTrigger className="w-min">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {keys.map((key) => (
              <SelectItem key={key} value={key}>
                {key}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </header>

      <div className="mt-10">
        <AgentThemeProvider palette={palettekey}>
          <div>
            <CardsDemo />
          </div>
        </AgentThemeProvider>
      </div>
    </main>
  );
}
