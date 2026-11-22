"use client";

import type { ReactElement, ReactNode } from "react";
import { XIcon } from "lucide-react";
import { Button } from "@app/ui/components/button";
import { Kbd } from "@app/ui/components/kbd";
import { cn } from "@app/ui/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@app/ui/components/tooltip";

export const composerToolbarButtonClassName =
  "h-7 min-w-7 rounded-full disabled:pointer-events-auto";

export const composerToolbarLabelClassName = "hidden @[26rem]:inline";

/** A removable composer mode with an icon-only layout in compact composers. */
export function ComposerToolbarChip({
  icon,
  label,
  tooltip,
  disabled,
  onRemove,
}: {
  icon: ReactNode;
  label: string;
  tooltip?: string;
  disabled?: boolean;
  onRemove(): void;
}) {
  return (
    <ComposerToolbarTooltip label={tooltip}>
      <Button
        type="button"
        size="xs"
        variant="ghost"
        disabled={disabled}
        aria-label={`Remove ${label.toLowerCase()}`}
        onClick={onRemove}
        className={cn(
          composerToolbarButtonClassName,
          "group/chip px-1.5 font-normal text-muted-foreground [&_svg]:size-3.5"
        )}
      >
        <span
          aria-hidden
          className="group-hover/chip:hidden group-focus-visible/chip:hidden"
        >
          {icon}
        </span>
        <XIcon
          aria-hidden
          className="hidden group-hover/chip:block group-focus-visible/chip:block"
        />
        <span className={composerToolbarLabelClassName}>{label}</span>
      </Button>
    </ComposerToolbarTooltip>
  );
}

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
