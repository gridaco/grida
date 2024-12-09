"use client";

import { useDocument } from "@/grida-canvas";
import {
  SidebarMenuItem,
  SidebarMenuItemAction,
  SidebarMenuItemActions,
  SidebarMenuItemLabel,
} from "@/components/sidebar";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  FrameIcon,
  BoxIcon,
  ComponentInstanceIcon,
  ImageIcon,
  TextIcon,
  TransformIcon,
  CircleIcon,
  LockOpen2Icon,
  LockClosedIcon,
  EyeOpenIcon,
  EyeClosedIcon,
  LockOpen1Icon,
  ViewVerticalIcon,
  ViewHorizontalIcon,
  Component1Icon,
} from "@radix-ui/react-icons";
import { grida } from "@/grida";
import React from "react";
import { useNodeAction } from "@/grida-canvas/provider";

function NodeHierarchyItemContextMenuWrapper({
  node_id,
  children,
}: React.PropsWithChildren<{
  node_id: string;
}>) {
  const change = useNodeAction(node_id)!;

  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {/* <ContextMenuItem onSelect={() => {}}>Copy</ContextMenuItem> */}
        {/* <ContextMenuItem>Paste here</ContextMenuItem> */}
        <ContextMenuItem onSelect={change.bringFront}>
          Bring to front
        </ContextMenuItem>
        <ContextMenuItem onSelect={change.pushBack}>
          Send to back
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            const n = prompt("Rename");
            if (n) change.name(n);
          }}
        >
          Rename
        </ContextMenuItem>
        {/* <ContextMenuItem>Add Container</ContextMenuItem> */}
        <ContextMenuItem onSelect={change.toggleActive}>
          Set Active/Inactive
        </ContextMenuItem>
        <ContextMenuItem onSelect={change.toggleLocked}>
          Lock/Unlock
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function NodeHierarchyList() {
  const {
    state: { document, selection, hovered_node_id },
    selectNode,
    pointerEnterNode,
    toggleNodeLocked,
    toggleNodeActive,
    getNodeDepth,
  } = useDocument();

  // TODO: need nested nodes for templates

  const ids = Object.keys(document.nodes);
  return (
    <>
      {ids.map((id) => {
        const n = document.nodes[id];
        const selected = selection.includes(n.id);
        const hovered = hovered_node_id === n.id;
        const depth = getNodeDepth(n.id);
        return (
          <NodeHierarchyItemContextMenuWrapper key={n.id} node_id={n.id}>
            <SidebarMenuItem
              muted
              hovered={hovered}
              level={depth}
              selected={selected}
              onSelect={() => {
                selectNode(n.id);
              }}
              icon={<NodeHierarchyItemIcon node={n} className="w-3.5 h-3.5" />}
              onPointerEnter={() => {
                pointerEnterNode(n.id);
              }}
              onPointerLeave={() => {
                pointerEnterNode(n.id);
              }}
            >
              <SidebarMenuItemLabel className="font-normal text-xs">
                {n.name}
              </SidebarMenuItemLabel>
              <SidebarMenuItemActions>
                <SidebarMenuItemAction
                  onClick={() => {
                    toggleNodeLocked(n.id);
                  }}
                >
                  {n.locked ? <LockClosedIcon /> : <LockOpen1Icon />}
                </SidebarMenuItemAction>
                <SidebarMenuItemAction
                  onClick={() => {
                    toggleNodeActive(n.id);
                  }}
                >
                  {n.active ? <EyeOpenIcon /> : <EyeClosedIcon />}
                </SidebarMenuItemAction>
              </SidebarMenuItemActions>
            </SidebarMenuItem>
          </NodeHierarchyItemContextMenuWrapper>
        );
      })}
    </>
  );
}

function NodeHierarchyItemIcon({
  className,
  node,
}: {
  node: grida.program.nodes.Node;
  className?: string;
}) {
  switch (node.type) {
    case "container":
      if (node.layout === "flex") {
        switch (node.direction) {
          case "horizontal":
            return <ViewVerticalIcon />;
          case "vertical":
            return <ViewHorizontalIcon />;
        }
      }
      return <FrameIcon className={className} />;
    case "component":
      return <Component1Icon className={className} />;
    case "image":
      return <ImageIcon className={className} />;
    case "text":
      return <TextIcon className={className} />;
    case "instance":
      return <ComponentInstanceIcon className={className} />;
    case "rectangle":
      return <BoxIcon className={className} />;
    case "ellipse":
      return <CircleIcon className={className} />;
    case "vector":
      return <TransformIcon className={className} />;
  }
  return <BoxIcon className={className} />;
}
