"use client";

import React from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrentTableView, useEditorState } from "@/scaffolds/editor";
import { ResourceTypeIcon } from "@/components/resource-type-icon";

export function TableViews() {
  const [state, dispatch] = useEditorState();

  const { datagrid_table_id } = state;

  const tb = useCurrentTableView();

  const tablegroup = state.tables.find((table) =>
    table.views.some((v) => v.id === datagrid_table_id)
  );

  return (
    <div className="flex items-center gap-2">
      <Tabs
        value={tb?.name}
        onValueChange={(value) => {
          dispatch({
            type: "editor/data-grid/table",
            name: value,
          });
        }}
      >
        <TabsList>
          {tablegroup?.views.map((table) => {
            return (
              <TabsTrigger key={table.type + table.name} value={table.name}>
                <ResourceTypeIcon
                  type={tablegroup.icon}
                  className="inline align-middle w-4 h-4 me-2"
                />
                {table.label}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
      {/* <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon">
            <PlusIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Add new view</TooltipContent>
      </Tooltip> */}
    </div>
  );
}
