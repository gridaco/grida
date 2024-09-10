"use client";

import React from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDatagridTable, useEditorState } from "@/scaffolds/editor";
import { ResourceTypeIcon } from "@/components/resource-type-icon";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "@radix-ui/react-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function TableViews() {
  const [state, dispatch] = useEditorState();

  const tb = useDatagridTable();

  if (!tb) {
    return <>ERR</>;
  }

  return (
    <div className="flex items-center gap-2">
      <Tabs
        value={tb.view_id ?? tb.name}
        onValueChange={(value) => {
          dispatch({
            type: "editor/data-grid/table/view",
            table_id: tb.id,
            view_id: value,
          });
        }}
      >
        <TabsList>
          <TabsTrigger key={tb.id.toString()} value={tb.name}>
            <ResourceTypeIcon
              type={tb.icon}
              className="inline align-middle w-4 h-4 me-2"
            />
            {tb.readonly && (
              <span className="me-2 text-xs font-mono text-muted-foreground">
                READONLY
              </span>
            )}
            {tb.label}
          </TabsTrigger>
          {tb?.views.map((view) => {
            return (
              <TabsTrigger key={view.id} value={view.id}>
                <ResourceTypeIcon
                  type={view.type}
                  className="inline align-middle w-4 h-4 me-2"
                />
                {view.label}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon">
                <PlusIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add new view</TooltipContent>
          </Tooltip>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-40">
          <DropdownMenuLabel>New View</DropdownMenuLabel>
          <DropdownMenuItem>
            <ResourceTypeIcon type="table" className="me-2 w-4 h-4" />
            Table
          </DropdownMenuItem>
          <DropdownMenuItem>
            <ResourceTypeIcon type="chart" className="me-2 w-4 h-4" />
            Chart
          </DropdownMenuItem>
          <DropdownMenuItem>
            <ResourceTypeIcon type="view-list" className="me-2 w-4 h-4" />
            List
          </DropdownMenuItem>
          <DropdownMenuItem>
            <ResourceTypeIcon type="view-gallery" className="me-2 w-4 h-4" />
            Gallery
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
