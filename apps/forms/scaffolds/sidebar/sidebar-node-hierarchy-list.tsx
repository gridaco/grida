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
  ContextMenuShortcut,
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
  LockClosedIcon,
  EyeOpenIcon,
  EyeClosedIcon,
  LockOpen1Icon,
  ViewVerticalIcon,
  ViewHorizontalIcon,
  Component1Icon,
} from "@radix-ui/react-icons";
import { grida } from "@/grida";
import React, { useMemo } from "react";
import { useNodeAction } from "@/grida-canvas/provider";
import { document as dq } from "@/grida-canvas/document-query";

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
        <ContextMenuItem onSelect={() => change.order("front")}>
          Bring to front
          <ContextMenuShortcut>{"]"}</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => change.order("back")}>
          Send to back
          <ContextMenuShortcut>{"["}</ContextMenuShortcut>
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
          <ContextMenuShortcut>{"⌘⇧H"}</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={change.toggleLocked}>
          Lock/Unlock
          <ContextMenuShortcut>{"⌘⇧L"}</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function NodeHierarchyList() {
  const {
    state: { document, document_ctx, selection, hovered_node_id },
    select,
    hoverNode,
    toggleNodeLocked,
    toggleNodeActive,
  } = useDocument();

  // TODO: need nested nodes for templates

  const list = useMemo(() => {
    return dq.hierarchy(document.root_id, document_ctx);
  }, [document.root_id, document_ctx]);

  // const ids = Object.keys(document.nodes);

  return (
    <>
      {list.map(({ id, depth }) => {
        const n = document.nodes[id];
        const selected = selection.includes(id);
        const hovered = hovered_node_id === id;
        return (
          <NodeHierarchyItemContextMenuWrapper key={id} node_id={id}>
            <SidebarMenuItem
              muted
              hovered={hovered}
              level={depth}
              selected={selected}
              onSelect={(e) => {
                if (e.metaKey || e.ctrlKey) {
                  select("selection", [id]);
                } else {
                  select([id]);
                }
              }}
              icon={<NodeHierarchyItemIcon node={n} className="w-3.5 h-3.5" />}
              onPointerEnter={() => {
                hoverNode(id, "enter");
              }}
              onPointerLeave={() => {
                hoverNode(id, "leave");
              }}
            >
              <SidebarMenuItemLabel className="font-normal text-xs">
                {n.name}
              </SidebarMenuItemLabel>
              <SidebarMenuItemActions>
                <SidebarMenuItemAction
                  onClick={() => {
                    toggleNodeLocked(id);
                  }}
                >
                  {n.locked ? <LockClosedIcon /> : <LockOpen1Icon />}
                </SidebarMenuItemAction>
                <SidebarMenuItemAction
                  onClick={() => {
                    toggleNodeActive(id);
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
    case "line":
    case "path":
      return <TransformIcon className={className} />;
  }
  return <BoxIcon className={className} />;
}
