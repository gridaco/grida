"use client";

import React from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDatagridTable, useEditorState } from "@/scaffolds/editor";
import { ResourceTypeIcon } from "@/components/resource-type-icon";

export function TableViews() {
  const tb = useDatagridTable();

  if (!tb) {
    return <>ERR</>;
  }

  return (
    <div className="flex items-center gap-2">
      <Tabs
        value={tb.name}
        // onValueChange={(value) => {
        //   dispatch({
        //     type: "editor/data-grid/view",
        //     table_id: tb.id,
        //     view_id: value,
        //   });
        // }}
      >
        <TabsList>
          <TabsTrigger key={tb.id.toString()} value={tb.name}>
            <ResourceTypeIcon
              type={tb.icon}
              className="inline align-middle w-4 min-size-4 me-2"
            />
            {tb.readonly && (
              <span className="me-2 text-xs font-mono text-muted-foreground">
                READONLY
              </span>
            )}
            {tb.label}
          </TabsTrigger>
          {/* {tb?.views.map((view) => {
            return (
              <TabsTrigger key={view.id} value={view.id}>
                <ResourceTypeIcon
                  type={view.type}
                  className="inline align-middle size-4 me-2"
                />
                {view.label}
              </TabsTrigger>
            );
          })} */}
        </TabsList>
      </Tabs>
    </div>
  );
}
