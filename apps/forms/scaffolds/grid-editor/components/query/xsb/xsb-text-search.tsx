"use client";

import React from "react";
import { Input } from "@/components/ui/input";
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
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useSchemaDefinition } from "@/scaffolds/data-query";
import assert from "assert";
import { PostgresTypeTools } from "@/lib/x-supabase/typemap";

export function XSBTextSearchInput({
  query,
  onQueryChange,
  column,
  onColumnChange,
}: {
  query?: string;
  onQueryChange?: (query: string) => void;
  column?: string | null;
  onColumnChange?: (column: string) => void;
}) {
  const def = useSchemaDefinition();
  assert(def, "Schema definition not found");

  const keys = Object.keys(def.properties);

  const nocolumn = !!!column;

  return (
    <div className="flex h-9 w-full rounded-md border border-input bg-transparent ps-0 text-sm shadow-sm transition-colors overflow-hidden">
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                data-missing={nocolumn}
                className="flex gap-2 text-muted-foreground w-40 overflow-hidden justify-start h-full rounded-tr-none rounded-br-none data-[missing='true']:text-workbench-accent-orange outline-none border-none focus:outline-none focus:border-none"
              >
                <div className="relative">
                  <SearchIcon className="h-4 w-4" />
                </div>
                <span className="text-xs font-normal w-full text-start overflow-hidden text-ellipsis">
                  {column ? attributes_label_text([column]) : "Select"}
                </span>

                <CaretDownIcon className="w-4 h-4 min-w-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>
            Full text search - Select a column for best performance
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent className="max-w-sm">
          <DropdownMenuLabel>Fields to Search</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={column || undefined}
            onValueChange={onColumnChange}
          >
            {keys.map((key) => {
              const property = def.properties[key];
              const supported = PostgresTypeTools.supportsTextSearch(
                property.format
              );

              return (
                <DropdownMenuRadioItem disabled={!supported} value={key}>
                  {key}{" "}
                  <span className="ms-2 text-xs text-muted-foreground">
                    {property.format}
                  </span>
                </DropdownMenuRadioItem>
              );
            })}
          </DropdownMenuRadioGroup>

          <DropdownMenuSeparator />
          <article className="text-xs text-muted-foreground p-1">
            <h6 className="py-1">
              <InfoCircledIcon className="inline-block h-4 w-4 me-1 align-bottom" />
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
        className="border-l py-1 px-3 appearance-none outline-none w-full placeholder:text-muted-foreground"
        type="search"
        placeholder="Type to search..."
        value={query}
        onChange={(e) => onQueryChange?.(e.target.value)}
      />
    </div>
    // {/* <SearchInput
    //   placeholder="Type to search..."
    //   onChange={(e) => onValueChange?.(e.target.value)}
    //   className="max-w-sm"
    //   variant="icon"
    // /> */}
  );
}

const attributes_label_text = (selectedAttributes: string[]) => {
  if (selectedAttributes.length === 0) {
    return;
  }
  if (selectedAttributes.length === 1) {
    return selectedAttributes[0];
  }
  return `${selectedAttributes[0]} and ${selectedAttributes.length - 1} more`;
};
