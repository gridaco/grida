"use client";

import React from "react";
import { NodeHierarchyGroup, ScenesGroup } from "./sidebar-node-hierarchy-list";
import { SidebarContent } from "@/components/ui/sidebar";

export function ModeDesign() {
  return (
    <SidebarContent>
      <ScenesGroup />
      <hr />
      <NodeHierarchyGroup />
    </SidebarContent>
  );
}
