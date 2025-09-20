"use client";

import React from "react";
import { useCurrentEditor } from "@/grida-canvas-react";
import { PlusIcon } from "@radix-ui/react-icons";
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import { ScenesList } from "./tree-scene";
import { NodeHierarchyList } from "./tree-node";

//

export function ScenesGroup() {
  const editor = useCurrentEditor();

  return (
    <SidebarGroup
      onContextMenu={(e) => e.preventDefault()}
      className="min-h-16 max-h-56 overflow-y-auto"
    >
      <SidebarGroupLabel>
        Scenes
        <SidebarGroupAction onClick={() => editor.createScene()}>
          <PlusIcon />
          <span className="sr-only">New Scene</span>
        </SidebarGroupAction>
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <ScenesList />
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function NodeHierarchyGroup() {
  return (
    <SidebarGroup className="flex-1" onContextMenu={(e) => e.preventDefault()}>
      <SidebarGroupLabel>Layers</SidebarGroupLabel>
      <SidebarGroupContent>
        <NodeHierarchyList />
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export { NodeHierarchyList };
