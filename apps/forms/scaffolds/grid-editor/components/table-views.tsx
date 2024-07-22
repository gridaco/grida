"use client";

import React from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEditorState } from "@/scaffolds/editor";
import { TableTypeIcon } from "@/components/table-type-icon";

export function TableViews() {
  const [state, dispatch] = useEditorState();

  const { datagrid_table } = state;

  const tablegroup = state.tables.find((table) =>
    table.views.some((v) => v.type === datagrid_table)
  );

  return (
    <div className="flex items-center gap-2">
      <Tabs
        value={state.datagrid_table}
        onValueChange={(value) => {
          dispatch({
            type: "editor/data-grid/table",
            table: value as any,
          });
        }}
      >
        <TabsList>
          {tablegroup?.views.map((table) => {
            return (
              <TabsTrigger key={table.type + table.name} value={table.type}>
                <TableTypeIcon
                  type={tablegroup.group}
                  className="inline align-middle w-4 h-4 me-2"
                />
                {table.label}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
      {/* <Button variant="ghost" size="icon">
        <PlusIcon />
      </Button> */}
    </div>
  );
}
