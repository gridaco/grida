"use client";

import { cn } from "@/utils";

export function PaletteColorChip({
  primary,
  selected,
  onClick,
}: {
  selected: boolean;
  primary: { h: number; s: number; l: number };
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      data-selected={selected}
      onClick={onClick}
      className={cn(
        "w-6 h-6 border-2 rounded-full",
        "data-[selected='true']:outline data-[selected='true']:outline-foreground data-[selected='true']:border-background"
      )}
      style={{
        backgroundColor: `hsl(${primary.h}, ${primary.s}%, ${primary.l}%)`,
      }}
    />
  );
}
