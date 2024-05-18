"ues client";

import GridEditor from "@/grid";
import { GridaBlockRenderer } from "@/grid/blocks";

import React from "react";
import { InsertPanel } from "./panel";

export default function MicrositeBuilder() {
  return (
    <main className="w-screen h-screen prose mx-auto flex items-center justify-center">
      <GridEditor
        renderer={GridaBlockRenderer}
        components={{
          insert_panel: InsertPanel,
        }}
      />
    </main>
  );
}
