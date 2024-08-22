"use client";

import React from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrentTableView, useEditorState } from "@/scaffolds/editor";
import { ResourceTypeIcon } from "@/components/resource-type-icon";

export function TableViews() {
  const [state, dispatch] = useEditorState();

  const tb = useCurrentTableView();

  if (!tb) {
    return <></>;
  }

  return (
    <div className="flex items-center gap-2">
      <Tabs
      // value={tb?.name}
      // onValueChange={(value) => {
      //   dispatch({
      //     type: "editor/data-grid/table",
      //     name: value,
      //   });
      // }}
      >
        <TabsList>
          <TabsTrigger key={tb.id.toString()} value={tb.name}>
            <ResourceTypeIcon
              type={tb.icon}
              className="inline align-middle w-4 h-4 me-2"
            />
            {tb.label}
          </TabsTrigger>
        </TabsList>
        {/* <TabsList>
          {table?.views.map((table) => {
            return (
              <TabsTrigger key={table.id.toString()} value={table.name}>
                <ResourceTypeIcon
                  type={table.icon}
                  className="inline align-middle w-4 h-4 me-2"
                />
                {table.label}
              </TabsTrigger>
            );
          })}
        </TabsList> */}
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
