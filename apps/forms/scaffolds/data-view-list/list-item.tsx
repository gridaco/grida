import React, { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Data } from "@/lib/data";
import type { DGResponseRow } from "../grid";
import { LineContent } from "../data-card/line";
import { cn } from "@/utils";

type TRowData = Pick<DGResponseRow, "__gf_id" | "raw" | "fields">;

const ITEM_MARGIN_Y = 2;
export const ITEM_HEIGHT = 36;
export const ITEM_SIZE = ITEM_HEIGHT + ITEM_MARGIN_Y * 2;

export function ListItem({
  data,
  properties,
}: {
  data: TRowData;
  properties: (Data.Relation.Attribute & { label: string })[];
}) {
  const filteredProperties = useMemo(() => {
    return properties.filter((p) => {
      // if value is empty, don't show
      const value = data.raw![p.name];
      if (value === null || value === undefined) return false;
      if (Array.isArray(value) && value.length === 0) return false;
      if (typeof value === "string" && value.trim() === "") return false;

      return true;
    });
  }, [data, properties]);

  const lines = useMemo(() => {
    return filteredProperties.map((prop, i) => {
      const value = data.raw![prop.name];

      return (
        <TooltipContainer
          key={prop.name}
          label={prop.label}
          className="max-w-40 data-[primary='true']:max-w-none"
        >
          <LineContent value={value} property={prop} />
        </TooltipContainer>
      );
    });
  }, [data, filteredProperties]);

  return (
    <div
      className="px-2 overflow-hidden"
      style={{
        height: ITEM_SIZE,
      }}
    >
      <div
        className="group overflow-hidden hover:bg-secondary cursor-default rounded-sm"
        style={{
          height: ITEM_HEIGHT,
        }}
      >
        <div className="px-4 flex items-center justify-between gap-2">
          <div className="text-lg font-semibold">{lines[0]}</div>
          <div className="flex items-center gap-2 text-xs">
            {lines.slice(1)}
          </div>
        </div>
      </div>
    </div>
  );
}

function TooltipContainer({
  label,
  children,
  className,
}: React.PropsWithChildren<{ label: string; className?: string }>) {
  return (
    <Tooltip delayDuration={100}>
      <TooltipTrigger
        className={cn("text-start overflow-hidden truncate", className)}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="bottom" align="center">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
