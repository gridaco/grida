"use client";

import React from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SupabaseLogo } from "@/components/logos";
import { useEditorState } from "@/scaffolds/editor";

export function TableViews() {
  const [state, dispatch] = useEditorState();

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
          {state.tables.map((table) => {
            return (
              <TabsTrigger key={table.type + table.name} value={table.type}>
                {table.type === "x-supabase-main-table" && (
                  <SupabaseLogo className="w-4 h-4 align-middle me-2" />
                )}
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
