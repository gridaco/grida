"use client";

import React from "react";
import { SearchInput } from "@/components/extension/search-input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function DataQueryTextSearch({
  onValueChange,
  placeholder = "Type to search",
  tooltip = "Search",
}: {
  onValueChange?: (txt: string) => void;
  placeholder?: string;
  tooltip?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger>
        <SearchInput
          placeholder={placeholder}
          onChange={(e) => onValueChange?.(e.target.value)}
          className="max-w-sm h-7"
          variant="icon"
        />
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
