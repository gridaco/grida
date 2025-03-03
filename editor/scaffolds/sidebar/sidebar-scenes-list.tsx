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
        );
      })}
    </SidebarMenu>
  );
}
