"use client";

import type { ComponentProps } from "react";
import { SelectTrigger } from "@app/ui/components/select";
import { cn } from "@app/ui/lib/utils";

/**
 * The compact, borderless model picker used by Desktop media composers.
 * Selected labels shrink without consuming the chevron or composer boundary
 * (see test/desktop-media-model-picker-overflow.md).
 */
export function MediaModelPickerTrigger({
  className,
  size = "sm",
  ...props
}: ComponentProps<typeof SelectTrigger>) {
  return (
    <SelectTrigger
      size={size}
      className={cn(
        "w-fit min-w-0 max-w-full gap-1 border-0 bg-transparent px-2 shadow-none [&_[data-slot=select-value]]:block [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate",
        className
      )}
      {...props}
    />
  );
}
