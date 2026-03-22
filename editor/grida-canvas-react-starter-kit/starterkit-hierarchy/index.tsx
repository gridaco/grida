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
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { ScenesList } from "./tree-scene";
import { NodeHierarchyList } from "./tree-node";

export function ScenesGroup() {
  const editor = useCurrentEditor();

  return (
    <SidebarGroup
      onContextMenu={(e) => e.preventDefault()}
      className="min-h-16 max-h-56 overflow-y-auto"
    >
      <SidebarGroupLabel>
        Scenes
        <SidebarGroupAction onClick={() => editor.surface.surfaceCreateScene()}>
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

export function DocumentHierarchy() {
  const editor = useCurrentEditor();

  return (
    <ResizablePanelGroup orientation="vertical" className="h-full min-h-0">
      <ResizablePanel defaultSize={"15%"} minSize={100} className="min-h-0">
        <SidebarGroup
          onContextMenu={(e) => e.preventDefault()}
          className="h-full flex flex-col min-h-0 p-0"
        >
          <div className="p-2">
            <SidebarGroupLabel>
              Scenes
              <SidebarGroupAction
                onClick={() => editor.surface.surfaceCreateScene()}
              >
                <PlusIcon />
                <span className="sr-only">New Scene</span>
              </SidebarGroupAction>
            </SidebarGroupLabel>
          </div>
          <SidebarGroupContent className="flex-1 min-h-0 overflow-y-auto px-2">
            <ScenesList />
          </SidebarGroupContent>
        </SidebarGroup>
      </ResizablePanel>

      <ResizableHandle />

      <ResizablePanel minSize={120} className="min-h-0">
        <SidebarGroup
          className="h-full flex flex-col min-h-0 p-0"
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="p-2">
            <SidebarGroupLabel>Layers</SidebarGroupLabel>
          </div>
          <SidebarGroupContent className="flex-1 min-h-0 overflow-y-auto px-2">
            <NodeHierarchyList />
          </SidebarGroupContent>
        </SidebarGroup>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

export { NodeHierarchyList };
