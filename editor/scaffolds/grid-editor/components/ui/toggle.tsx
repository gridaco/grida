import React from "react";
import { Button } from "@app/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@app/ui/components/tooltip";
import { cn } from "@app/ui/lib/utils";
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
          {active && <IconButtonDotBadge accent="orange" />}
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
        className="size-4 text-muted-foreground data-[state='on']:text-workbench-accent-sky"
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
        className="size-4 text-muted-foreground data-[state='on']:text-workbench-accent-sky"
      />
    </QueryToggle>
  );
}
