"use client";
import React, { useMemo } from "react";

import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { FileIcon } from "lucide-react";
import { useDocument } from "@/grida-react-canvas";
import { PlusIcon } from "@radix-ui/react-icons";

export function ScenesGroup() {
  const { createScene } = useDocument();

  return (
    <SidebarGroup>
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

export function ScenesList() {
  const { scenes: scenesmap, scene_id, loadScene } = useDocument();

  const scenes = useMemo(() => {
    return Object.values(scenesmap).sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0)
    );
  }, [scenesmap]);

  return (
    <SidebarMenu>
      {scenes.map((scene) => {
        const isActive = scene.id === scene_id;
        return (
          <SceneItemContextMenuWrapper scene_id={scene.id} key={scene.id}>
            <SidebarMenuItem key={scene.id}>
              <SidebarMenuButton
                isActive={isActive}
                size="sm"
                onClick={() => loadScene(scene.id)}
              >
                <FileIcon />
                {scene.name}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SceneItemContextMenuWrapper>
        );
      })}
    </SidebarMenu>
  );
}

function SceneItemContextMenuWrapper({
  scene_id,
  children,
}: React.PropsWithChildren<{
  scene_id: string;
}>) {
  const { deleteScene, duplicateScene, renameScene } = useDocument();

  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-52">
        <ContextMenuItem
          onSelect={() => {
            const n = prompt("Rename");
            if (n) renameScene(scene_id, n);
          }}
          className="text-xs"
        >
          Rename
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            duplicateScene(scene_id);
          }}
          className="text-xs"
        >
          Duplicate
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => {
            deleteScene(scene_id);
          }}
          className="text-xs"
        >
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
