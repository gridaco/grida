"use client";

import React from "react";
import { NodeHierarchyGroup, ScenesGroup } from "./sidebar-node-hierarchy-list";

export function ModeDesign() {
  return (
    <>
      <ScenesGroup />
      <hr />
      <NodeHierarchyGroup />
    </>
  );
}
