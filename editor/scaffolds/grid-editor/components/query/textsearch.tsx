"use client";

import React from "react";
import { SearchInput } from "@/components/extension/search-input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDebounceCallback } from "usehooks-ts";

export function DataQueryTextSearch({
  onValueChange,
  placeholder = "Type to search",
  tooltip = "Search",
  debounce = 0,
}: {
  onValueChange?: (txt: string) => void;
  placeholder?: string;
  tooltip?: string;
  debounce?: number;
}) {
  const onValueChangeDebounced = useDebounceCallback((value: string) => {
    onValueChange?.(value);
  }, debounce);

  return (
    <Tooltip>
      <TooltipTrigger>
        <SearchInput
          placeholder={placeholder}
          onChange={(e) => onValueChangeDebounced?.(e.target.value)}
          className="max-w-sm h-7"
          variant="icon"
        />
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
