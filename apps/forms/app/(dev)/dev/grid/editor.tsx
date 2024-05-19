"use client";

import { GridContext, GridEditor, useGrid } from "@/grid";
import { GridaBlockRenderer } from "@/app/(dev)/dev/grid/blocks";
import { InsertPanel } from "./panel";
import React, { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { create_initial_grida_block } from "./blocks/data";

export function PageBuilder() {
  return (
    <GridContext>
      <App />
    </GridContext>
  );
}

function App() {
  const [is_insert_panel_open, set_is_insert_panel_open] = useState(false);
  const grid = useGrid();

  return (
    <div className="w-full h-full flex">
      <>
        <Popover
          open={is_insert_panel_open}
          onOpenChange={(open) => {
            set_is_insert_panel_open(open);
            // also clear the marquee
          }}
        >
          <PopoverTrigger className="absolute top-0 left-0 w-40 h40 bg-red-900 z-10">
            <div />
          </PopoverTrigger>
          <PopoverContent
            align="start"
            side="top"
            sideOffset={100}
            alignOffset={100}
          >
            <InsertPanel
              onInsert={(type) => {
                grid.insertBlockOnAera(create_initial_grida_block(type));
                set_is_insert_panel_open(false);
              }}
            />
          </PopoverContent>
        </Popover>
      </>
      <div className="grow prose mx-auto flex items-center justify-center">
        <GridEditor
          renderer={GridaBlockRenderer}
          onMarqueeEnd={() => {
            set_is_insert_panel_open(true);
          }}
          onBlockDoubleClick={(block) => {
            //
          }}
        />
      </div>
      <aside className="grow max-w-md border-s p-4">
        <h1 className="text-xl">{grid.selection}</h1>
      </aside>
    </div>
  );
}
