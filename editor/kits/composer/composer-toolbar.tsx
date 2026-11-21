"use client";

import type { ReactElement } from "react";
import { Kbd } from "@app/ui/components/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@app/ui/components/tooltip";

export const composerToolbarButtonClassName =
  "h-7 min-w-7 rounded-full disabled:pointer-events-auto";

export function ComposerToolbarTooltip({
  label,
  shortcut,
  children,
}: {
  label?: string;
  shortcut?: string;
  children: ReactElement;
}) {
  if (!label) return children;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent
          side="top"
          sideOffset={4}
          className="flex max-w-64 items-center gap-2"
        >
          {label}
          {shortcut && <Kbd>{shortcut}</Kbd>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
