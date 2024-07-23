"use client";

import { cn } from "@/utils";

type HSL = { h: number; s: number; l: number };

export function PaletteColorChip({
  primary,
  secondary,
  selected,
  background,
  onSelect,
  className,
}: {
  primary: HSL;
  secondary?: HSL;
  background?: HSL;
  selected?: boolean;
  onSelect?: () => void;
  className?: string;
}) {
  return (
    <div
      data-selected={selected}
      onClick={onSelect}
      className={cn(
        "w-6 h-6 border-2 rounded-full overflow-hidden cursor-pointer",
        "data-[selected='true']:outline data-[selected='true']:outline-foreground data-[selected='true']:border-background",
        className
      )}
    >
      <div className="flex w-full h-full">
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
