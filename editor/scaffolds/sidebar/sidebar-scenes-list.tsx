"use client";
import React from "react";

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { FileIcon } from "lucide-react";
import { useDocument } from "@/grida-react-canvas";

function SceneItem() {
  return <></>;
}

export function ScenesList() {
  const { scenes, scene_id, loadScene } = useDocument();

  return (
    <SidebarMenu>
      {Object.values(scenes).map((scene) => {
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
