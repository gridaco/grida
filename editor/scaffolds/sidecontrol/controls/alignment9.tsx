import React from "react";
import { cn } from "@/components/lib/utils";
import grida from "@grida/schema";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type cmath from "@grida/cmath";
type TMixed<T> = typeof grida.mixed | T;

const ALIGNMENTS: Array<{
  key: cmath.Alignment9;
  label: string;
}> = [
  { key: "top-left", label: "Top left" },
  { key: "top-center", label: "Top" },
  { key: "top-right", label: "Top right" },
  { key: "center-left", label: "Left" },
  { key: "center", label: "Center" },
  { key: "center-right", label: "Right" },
  { key: "bottom-left", label: "Bottom left" },
  { key: "bottom-center", label: "Bottom" },
  { key: "bottom-right", label: "Bottom right" },
];

export function Alignment9Control({
  value,
  onValueChange,
  className,
}: {
  value?: TMixed<cmath.Alignment9>;
  onValueChange?: (value: cmath.Alignment9) => void;
  className?: string;
}) {
  const isMixed = value === grida.mixed;
  const selected = !isMixed ? value : undefined;
  const selectedIndex =
    selected != null ? ALIGNMENTS.findIndex((o) => o.key === selected) : -1;
  const rovingTabIndex = selectedIndex >= 0 ? selectedIndex : 0;

  return (
    <div
      className={cn(
        "grid grid-cols-3 grid-rows-3 px-0.5 py-1 aspect-video min-h-15 rounded-md border border-input bg-transparent dark:bg-input/30 shadow-xs",
        className
      )}
      role="radiogroup"
      aria-label="Alignment"
      data-mixed={isMixed ? "true" : "false"}
    >
      {ALIGNMENTS.map((o, index) => {
        const isSelected = selected === o.key;
        return (
          <Tooltip key={o.key} disableHoverableContent>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onValueChange?.(o.key)}
                role="radio"
                aria-checked={isSelected}
                aria-label={o.label}
                tabIndex={index === rovingTabIndex ? 0 : -1}
                data-focused={isSelected}
                className={cn(
                  "group/alignment9-cell flex items-center justify-center transition-colors",
                  "focus:outline-none"
                )}
              >
                <div
                  className={cn(
                    "size-1.5 rounded-[2px] transition-colors",
                    isSelected
                      ? "bg-workbench-accent-sky"
                      : "bg-muted-foreground/70 group-hover/alignment9-cell:bg-muted-foreground"
                  )}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent collisionPadding={4}>{o.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
