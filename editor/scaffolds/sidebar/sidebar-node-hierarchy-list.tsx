"use client";

import React from "react";
import { useDocument } from "@/grida-canvas-react";
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import { PlusIcon } from "@radix-ui/react-icons";
import {
  NodeHierarchyList,
  ScenesList,
} from "@/grida-canvas-react-starter-kit/starterkit-hierarchy";

export function ScenesGroup() {
  const { createScene } = useDocument();

  return (
    <SidebarGroup
      onContextMenu={(e) => e.preventDefault()}
      className="min-h-16 max-h-56 overflow-y-auto"
    >
      <SidebarGroupLabel>
        Scenes
        <SidebarGroupAction onClick={() => createScene()}>
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
