"use client";

import React from "react";
import { Selection, Zoom } from "./sidecontrol-node-selection";
import { SidebarSection } from "@/components/sidebar";
import { DocumentProperties } from "./sidecontrol-document-properties";

export function SideControlDoctypeCanvas() {
  return (
    <>
      <SidebarSection className="mb-4 px-2 flex justify-end">
        <Zoom />
      </SidebarSection>
      <hr />
      <Selection
        empty={
          <div className="mt-4 mb-10">
            <DocumentProperties />
          </div>
        }
      />
    </>
  );
}
