"use client";

import React, { useMemo } from "react";
import { useDocument } from "@/grida-react-canvas";
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
import { PlusIcon, FileIcon } from "@radix-ui/react-icons";
import {
  NodeHierarchyList,
  ScenesList,
} from "@/grida-react-canvas-starter-kit/starterkit-hierarchy";

export function ScenesGroup() {
  const { createScene } = useDocument();

  return (
    <SidebarGroup onContextMenu={(e) => e.preventDefault()}>
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

// function ScenesList() {
//   const { scenes: scenesmap, scene_id, loadScene } = useDocument();

//   const scenes = useMemo(() => {
//     return Object.values(scenesmap).sort(
//       (a, b) => (a.order ?? 0) - (b.order ?? 0)
//     );
//   }, [scenesmap]);

//   return (
//     <SidebarMenu>
//       {scenes.map((scene) => {
//         const isActive = scene.id === scene_id;
//         return (
//           <SceneItemContextMenuWrapper scene_id={scene.id} key={scene.id}>
//             <SidebarMenuItem key={scene.id}>
//               <SidebarMenuButton
//                 isActive={isActive}
//                 size="sm"
//                 onClick={() => loadScene(scene.id)}
//               >
//                 <FileIcon />
//                 {scene.name}
//               </SidebarMenuButton>
//             </SidebarMenuItem>
//           </SceneItemContextMenuWrapper>
//         );
//       })}
//     </SidebarMenu>
//   );
// }

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
