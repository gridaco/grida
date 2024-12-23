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

function hierarchy(
  root_id: string,
  ctx: grida.program.document.internal.IDocumentDefinitionRuntimeHierarchyContext
): { id: string; depth: number }[] {
  const collectNodeIds = (
    nodeId: string,
    depth: number,
    result: { id: string; depth: number }[] = []
  ): { id: string; depth: number }[] => {
    result.push({ id: nodeId, depth }); // Add current node ID with its depth

    // Get children from context
    const children = ctx.__ctx_nid_to_children_ids[nodeId] ?? [];
    for (const childId of children) {
      collectNodeIds(childId, depth + 1, result); // Increase depth for children
    }

    return result;
  };

  // Start traversal from the root node
  return collectNodeIds(root_id, 0);
}

export function NodeHierarchyList() {
  const {
    state: { document, document_ctx, selection, hovered_node_id },
    select,
    pointerEnterNode,
    toggleNodeLocked,
    toggleNodeActive,
  } = useDocument();

  // TODO: need nested nodes for templates

  const list = useMemo(() => {
    return hierarchy(document.root_id, document_ctx);
  }, [document.root_id, document_ctx]);

  // const ids = Object.keys(document.nodes);

  return (
    <>
      {list.map(({ id, depth }) => {
        const n = document.nodes[id];
        const selected = selection.includes(n.id);
        const hovered = hovered_node_id === n.id;
        return (
          <NodeHierarchyItemContextMenuWrapper key={n.id} node_id={n.id}>
            <SidebarMenuItem
              muted
              hovered={hovered}
              level={depth}
              selected={selected}
              onSelect={(e) => {
                if (e.metaKey || e.ctrlKey) {
                  select("selection", [n.id]);
                } else {
                  select([n.id]);
                }
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
    case "polyline":
    case "line":
    case "path":
      return <TransformIcon className={className} />;
  }
  return <BoxIcon className={className} />;
}
