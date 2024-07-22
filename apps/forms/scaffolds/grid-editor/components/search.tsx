"use client";

import React, { useCallback, useMemo, useState } from "react";
import { useEditorState } from "../../editor";
import { SearchInput } from "@/components/extension/search-input";
import { useDebounceCallback } from "usehooks-ts";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function GridLocalSearch() {
  const [state, dispatch] = useEditorState();

  const onSearchChange = useDebounceCallback((txt: string) => {
    dispatch({
      type: "editor/data-grid/filter",
      localsearch: txt,
    });
  }, 250);

  return (
    <Tooltip>
      <TooltipTrigger>
        <SearchInput
          placeholder="Search locally"
          onChange={(e) => onSearchChange(e.target.value)}
          className="max-w-sm"
          variant="icon"
        />
      </TooltipTrigger>
      <TooltipContent>Local search - Search within loaded data</TooltipContent>
    </Tooltip>
  );
}
