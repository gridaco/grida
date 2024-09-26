import React from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/utils";
import { IconButtonDotBadge } from "./dotbadge";
import { ArrowDownUpIcon, ListFilterIcon } from "lucide-react";

export function QueryToggle({
  active,
  tooltip,
  children,
}: React.PropsWithChildren<{ active?: boolean; tooltip: React.ReactNode }>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "relative",
            "text-muted-foreground",
            active && " text-accent-foreground"
          )}
        >
          {children}
          {active && <IconButtonDotBadge />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export function DataQueryPredicatesMenuTriggerButton({
  active,
}: {
  active?: boolean;
}) {
  return (
    <QueryToggle tooltip="Filter">
      <ListFilterIcon
        data-state={active ? "on" : "off"}
        className="w-4 h-4 text-muted-foreground data-[state='on']:text-workbench-accent-1"
      />
    </QueryToggle>
  );
}

export function DataQueryOrderbyMenuTriggerButton({
  active,
}: {
  active?: boolean;
}) {
  return (
    <QueryToggle tooltip="Sort">
      <ArrowDownUpIcon
        data-state={active ? "on" : "off"}
        className="w-4 h-4 text-muted-foreground data-[state='on']:text-workbench-accent-1"
      />
    </QueryToggle>
  );
}
