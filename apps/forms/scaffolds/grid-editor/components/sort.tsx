"use client";

import React from "react";
import { Cross2Icon, PlusIcon, TrashIcon } from "@radix-ui/react-icons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ArrowDownUpIcon } from "lucide-react";
import { cn } from "@/utils";
import { PopoverClose } from "@radix-ui/react-popover";
import { IconButtonDotBadge } from "./dotbadge";
import { WorkbenchUI } from "@/components/workbench";
import { useDataGridOrderby } from "@/scaffolds/editor/use";

export function XSupaDataGridSortTrigger() {
  const { isset } = useDataGridOrderby();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "relative",
            "text-muted-foreground",
            isset && " text-accent-foreground"
          )}
        >
          <ArrowDownUpIcon
            data-state={isset ? "on" : "off"}
            className="w-4 h-4 text-muted-foreground data-[state='on']:text-workbench-accent-1"
          />
          {isset && <IconButtonDotBadge />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>Sort</TooltipContent>
    </Tooltip>
  );
}

/**
 * this can also be used for form query, but at this moment, form does not have a db level field sorting query.
 * plus, this uses the column name, which in the future, it should be using field id for more universal handling.
 * when it updates to id, the x-supabase query route will also have to change.
 */
export function XSupaDataGridSortMenu({
  children,
}: React.PropsWithChildren<{}>) {
  const {
    orderby,
    isset,
    properties,
    usedkeys,
    unusedkeys,
    onClear,
    onAdd,
    onUpdate,
    onRemove,
  } = useDataGridOrderby();

  if (!isset) {
    return <AddOrderbyMenu>{children}</AddOrderbyMenu>;
  }

  return (
    <Popover modal>
      <PopoverTrigger>{children}</PopoverTrigger>
      <PopoverContent className="p-2 w-full">
        <section className="pb-2" hidden={!isset}>
          <div className="flex flex-col space-y-2 w-full">
            {usedkeys.map((col) => {
              const ob = orderby[col];
              return (
                <div key={col} className="flex gap-2 w-full items-center">
                  <div className="flex items-center gap-2 flex-1">
                    <div className="flex-1">
                      <Select
                        disabled
                        value={ob.column}
                        onValueChange={(value) => {
                          onUpdate(value, ob);
                        }}
                      >
                        <SelectTrigger
                          className={WorkbenchUI.selectVariants({
                            variant: "trigger",
                            size: "sm",
                          })}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.keys(properties).map((key) => (
                            <SelectItem key={key} value={key}>
                              {key}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Select
                        value={ob.ascending ? "ASC" : "DESC"}
                        onValueChange={(value) => {
                          onUpdate(ob.column, {
                            ascending: value === "ASC",
                          });
                        }}
                      >
                        <SelectTrigger
                          className={WorkbenchUI.selectVariants({
                            variant: "trigger",
                            size: "sm",
                          })}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ASC">Ascending</SelectItem>
                          <SelectItem value="DESC">Descending</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="w-6 h-6"
                    onClick={() => onRemove(col)}
                  >
                    <TrashIcon className="w-3 h-3" />
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
        <section className="flex flex-col">
          <AddOrderbyMenu asChild>
            <Button variant="ghost" size="sm" className="flex justify-start">
              <PlusIcon className="w-4 h-4 me-2 align-middle" /> Pick a column
              to sort by
            </Button>
          </AddOrderbyMenu>
          {isset && (
            <PopoverClose asChild>
              <Button
                variant="ghost"
                size="sm"
                className="flex justify-start"
                onClick={onClear}
              >
                <TrashIcon className="w-4 h-4 me-2 align-middle" /> Delete sort
              </Button>
            </PopoverClose>
          )}
        </section>
      </PopoverContent>
    </Popover>
  );
}

function AddOrderbyMenu({
  asChild,
  children,
}: React.PropsWithChildren<{ asChild?: boolean }>) {
  const { properties, unusedkeys, onAdd } = useDataGridOrderby();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild={asChild}>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {unusedkeys.map((key) => (
          <DropdownMenuItem key={key} onSelect={() => onAdd(key)}>
            {key}{" "}
            <span className="ms-2 text-xs text-muted-foreground">
              {properties[key].format}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
