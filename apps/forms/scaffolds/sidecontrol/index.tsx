"use client";

import { SidebarRoot, SidebarSection } from "@/components/sidebar";
import { Inconsolata, Inter, Lora } from "next/font/google";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useState } from "react";
import { Ag } from "@/components/design/ag";

const inter = Inter({ subsets: ["latin"], display: "swap" });
const lora = Lora({ subsets: ["latin"], display: "swap" });
const inconsolata = Inconsolata({ subsets: ["latin"], display: "swap" });

const fonts = {
  inter,
  lora,
  inconsolata,
};

export function SideControl({ mode }: { mode: "blocks" }) {
  return (
    <SidebarRoot side="right">
      <div className="h-5" />
      {mode === "blocks" && <ModeBlocks />}
    </SidebarRoot>
  );
}

function ModeBlocks() {
  return (
    <SidebarSection>
      <FontFamily />
    </SidebarSection>
  );
}

function FontFamily() {
  const [font, setFont] = useState("inter");

  return (
    <ToggleGroup
      type="single"
      defaultValue={font}
      value={font}
      onValueChange={(value) => setFont(value as any)}
    >
      <ToggleGroupItem value={"inter"} className="h-full w-24">
        <div className="flex flex-col items-center justify-center gap-2 p-1">
          <Ag className="text-2xl" fontClassName={fonts.inter.className} />
          Default
        </div>
      </ToggleGroupItem>
      <ToggleGroupItem value={"lora"} className="h-full w-24">
        <div className="flex flex-col items-center justify-center gap-2 p-1">
          <Ag className="text-2xl" fontClassName={fonts.lora.className} />
          Serif
        </div>
      </ToggleGroupItem>
      <ToggleGroupItem value={"inconsolata"} className="h-full w-24">
        <div className="flex flex-col items-center justify-center gap-2 p-1">
          <Ag
            className="text-2xl"
            fontClassName={fonts.inconsolata.className}
          />
          Mono
        </div>
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
