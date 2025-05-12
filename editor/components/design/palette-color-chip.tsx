"use client";

import { cn } from "@/components/lib/utils";

type HSL = { h: number; s: number; l: number };

export function PaletteColorChip({
  primary,
  secondary,
  selected,
  background,
  onSelect,
  className,
  orientation = "horizontal",
}: {
  primary: HSL;
  secondary?: HSL;
  background?: HSL;
  selected?: boolean;
  onSelect?: () => void;
  className?: string;
  orientation?: "vertical" | "horizontal";
}) {
  return (
    <div
      data-selected={selected}
      onClick={onSelect}
      className={cn(
        "size-6 border-2 rounded-full overflow-hidden cursor-pointer",
        "data-[selected='true']:outline data-[selected='true']:outline-foreground data-[selected='true']:border-background",
        className
      )}
    >
      <div
        className="flex w-full h-full"
        style={{
          flexDirection: orientation === "vertical" ? "column" : "row",
        }}
      >
        {background && (
          <div
            className="flex-1"
            style={{
              backgroundColor: csshsl(background),
            }}
          />
        )}
        <div
          className="flex-1"
          style={{
            backgroundColor: csshsl(primary),
          }}
        />
        {secondary && (
          <div
            className="flex-1"
            style={{
              backgroundColor: csshsl(secondary),
            }}
          />
        )}
      </div>
    </div>
  );
}

function csshsl(hsl: HSL): string {
  return `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
}
