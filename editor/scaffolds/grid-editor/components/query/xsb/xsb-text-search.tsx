"use client";

import React from "react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CaretDownIcon, InfoCircledIcon } from "@radix-ui/react-icons";
import { SearchIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import assert from "assert";
import { PostgresTypeTools } from "@/lib/x-supabase/typemap";
import { EditorSymbols } from "@/scaffolds/editor/symbols";
import { useExpandableInput } from "@/components/extension/search-input";
import { motion } from "motion/react";
import { cn } from "@/components/lib/utils";
import { useTableDefinition } from "@/scaffolds/data-query";

export function XSBTextSearchInput({
  query,
  onQueryChange,
  column,
  onColumnChange,
  config,
}: {
  query?: string;
  onQueryChange?: (query: string) => void;
  column?: string | null;
  onColumnChange?: (column: string | null) => void;
  config?: {
    /**
     * if on, null column is interpreted as local search
     */
    localsearch: "on" | "off";
  };
}) {
  const localsearch_on = config?.localsearch === "on";

  const {
    rootRef,
    inputRef,
    isExpanded,
    onTriggerClick,
    onInputBlur,
    onKeyDown,
  } = useExpandableInput(["ignore"]);

  const def = useTableDefinition();
  assert(def, "Schema definition not found");

  const keys = Object.keys(def.properties);

  const missing = column === undefined || (column === null && !localsearch_on);
  const active = !!query;

  const _onColumnChange = (column: string) => {
    if (
      column === EditorSymbols.SystemKey.QUERY_TS_SEARCH_LOCALLY.description!
    ) {
      onColumnChange?.(null);
    } else {
      onColumnChange?.(column);
    }

    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

  return (
    <motion.div
      tabIndex={0}
      className="relative w-full h-9"
      animate={{ width: isExpanded ? "100%" : 36 }}
      initial={{ width: 36 }}
      transition={{ duration: 0.15 }}
      onClick={onTriggerClick}
      onKeyDown={onKeyDown}
    >
      {!isExpanded && (
        <div
          data-state={active ? "on" : "off"}
          className={cn(
            "text-muted-foreground data-[state='on']:text-workbench-accent-sky",
            "absolute left-0",
            buttonVariants({
              variant: "ghost",
              size: "icon",
            }),
            isExpanded && "pointer-events-none"
          )}
        >
          <SearchIcon className="size-4" />
        </div>
      )}
      {isExpanded && (
        <div
          tabIndex={0}
          ref={rootRef}
          className="flex w-full rounded-md border border-input bg-transparent text-sm shadow-sm transition-colors overflow-hidden"
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div>
                <Tooltip>
                  <TooltipTrigger>
                    <div
                      data-missing={missing}
                      className={cn(
                        buttonVariants({ variant: "ghost" }),
                        "flex gap-2 text-muted-foreground justify-start px-2 w-36 overflow-hidden h-full rounded-none data-[missing='true']:text-workbench-accent-orange outline-none border-none focus:outline-none focus:border-none"
                      )}
                    >
                      <div className="relative">
                        <SearchIcon className="size-4" />
                      </div>
                      <span className="flex-1 text-xs font-normal w-full text-start overflow-hidden text-ellipsis">
                        {column === undefined
                          ? "Select"
                          : attributes_label_text(column, localsearch_on)}
                      </span>
                      <CaretDownIcon className="size-4 min-w-4" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    Full text search - Select a column for best performance
                  </TooltipContent>
                </Tooltip>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="max-w-sm" id="ignore">
              <DropdownMenuLabel>Fields to Search</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={
                  column === null && localsearch_on
                    ? EditorSymbols.SystemKey.QUERY_TS_SEARCH_LOCALLY
                        .description!
                    : (column ?? undefined)
                }
                onValueChange={_onColumnChange}
              >
                {keys.map((key) => {
                  const property = def.properties[key];
                  const supported = PostgresTypeTools.supportsTextSearch(
                    property.format
                  );

                  return (
                    <DropdownMenuRadioItem
                      key={key}
                      disabled={!supported}
                      value={key}
                      id="ignore"
                    >
                      {key}{" "}
                      <span className="ms-2 text-xs text-muted-foreground">
                        {property.format}
                      </span>
                    </DropdownMenuRadioItem>
                  );
                })}
                {localsearch_on && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuRadioItem
                      id="ignore"
                      value={
                        EditorSymbols.SystemKey.QUERY_TS_SEARCH_LOCALLY
                          .description!
                      }
                    >
                      Search Locally
                      <span className="ms-2 text-xs text-muted-foreground">
                        Search within loaded data, locally
                      </span>
                    </DropdownMenuRadioItem>
                  </>
                )}
              </DropdownMenuRadioGroup>

              <DropdownMenuSeparator />
              <article className="text-xs text-muted-foreground p-1">
                <h6 className="py-1">
                  <InfoCircledIcon className="inline-block size-4 me-1 align-bottom" />
                  <strong>What is this?</strong>
                </h6>
                <p>
                  FTS can bring performance issues on large datasets. To prevent
                  unnecessary load on the server, select the columns you want to
                  search in.{" "}
                  <Link
                    href="https://supabase.com/docs/guides/database/full-text-search"
                    target="_blank"
                    className="underline"
                  >
                    Learn More.
                  </Link>
                </p>
              </article>
            </DropdownMenuContent>
          </DropdownMenu>
          <input
            tabIndex={0}
            ref={inputRef}
            onBlur={onInputBlur}
            className="border-l py-1 px-3 appearance-none outline-none w-full placeholder:text-muted-foreground"
            type="search"
            placeholder="Type to search..."
            value={query}
            onChange={(e) => onQueryChange?.(e.target.value)}
          />
        </div>
      )}
    </motion.div>

    // {/* <SearchInput
    //   placeholder="Type to search..."
    //   onChange={(e) => onValueChange?.(e.target.value)}
    //   className="max-w-sm"
    //   variant="icon"
    // /> */}
  );
}

const attributes_label_text = (
  selectedAttributes: string[] | string | null,
  localsearch_on: boolean
) => {
  if (selectedAttributes === null) {
    if (localsearch_on) return "Local Search";
    return "Select";
  }

  if (typeof selectedAttributes === "string") {
    return selectedAttributes;
  }

  if (selectedAttributes.length === 0) {
    return;
  }

  if (selectedAttributes.length === 1) {
    return selectedAttributes[0];
  }

  return `${selectedAttributes[0]} and ${selectedAttributes.length - 1} more`;
};
