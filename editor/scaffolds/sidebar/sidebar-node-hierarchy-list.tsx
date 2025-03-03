"use client";

import { useDocument } from "@/grida-react-canvas";
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
  ContextMenuSeparator,
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
  TransparencyGridIcon,
  MixIcon,
  VideoIcon,
  GlobeIcon,
} from "@radix-ui/react-icons";
import { grida } from "@/grida";
import React, { useMemo } from "react";
import {
  useCurrentScene,
  useNodeAction,
  useTransform,
} from "@/grida-react-canvas/provider";
import { document as dq } from "@/grida-react-canvas/document-query";

function NodeHierarchyItemContextMenuWrapper({
  node_id,
  children,
}: React.PropsWithChildren<{
  node_id: string;
}>) {
  const { copy, deleteNode } = useDocument();
  const { fit } = useTransform();
  const change = useNodeAction(node_id)!;

  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-52">
        <ContextMenuItem
          onSelect={() => {
            copy(node_id);
          }}
          className="text-xs"
        >
          Copy
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            const n = prompt("Rename");
            if (n) change.name(n);
          }}
          className="text-xs"
        >
          Rename
        </ContextMenuItem>
        <ContextMenuSeparator />
        {/* <ContextMenuItem onSelect={() => {}}>Copy</ContextMenuItem> */}
        {/* <ContextMenuItem>Paste here</ContextMenuItem> */}
        <ContextMenuItem
          onSelect={() => change.order("front")}
          className="text-xs"
        >
          Bring to front
          <ContextMenuShortcut>{"]"}</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => change.order("back")}
          className="text-xs"
        >
          Send to back
          <ContextMenuShortcut>{"["}</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        {/* <ContextMenuItem>Add Container</ContextMenuItem> */}
        <ContextMenuItem onSelect={change.toggleActive} className="text-xs">
          Set Active/Inactive
          <ContextMenuShortcut>{"⌘⇧H"}</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            fit([node_id]);
          }}
          className="text-xs"
        >
          Zoom to fit
          <ContextMenuShortcut>{"⇧1"}</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={change.toggleLocked} className="text-xs">
          Lock/Unlock
          <ContextMenuShortcut>{"⌘⇧L"}</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => {
            deleteNode(node_id);
          }}
          className="text-xs"
        >
          Delete
          <ContextMenuShortcut>{"⌫"}</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function NodeHierarchyList() {
  const {
    state: { document, document_ctx },
    select,
    hoverNode,
    toggleNodeLocked,
    toggleNodeActive,
  } = useDocument();
  const { children, selection, hovered_node_id } = useCurrentScene();

  const list = useMemo(() => {
    // TODO: need nested nodes for templates
    return children.map((top) => dq.hierarchy(top, document_ctx)).flat();
  }, [children, document_ctx]);

  // const ids = Object.keys(document.nodes);

  return (
    <>
      {list.map(({ id, depth }) => {
        const n = document.nodes[id];
        if (!n) return null;
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
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleNodeLocked(id);
                  }}
                >
                  {n.locked ? <LockClosedIcon /> : <LockOpen1Icon />}
                </SidebarMenuItemAction>
                <SidebarMenuItemAction
                  onClick={(e) => {
                    e.stopPropagation();
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
    case "iframe":
      return <GlobeIcon className={className} />;
    case "richtext":
      return <TextIcon className={className} />;
    case "video":
      return <VideoIcon className={className} />;
    case "template_instance":
      return <MixIcon className={className} />;
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
    case "bitmap":
      return <TransparencyGridIcon className={className} />;
  }
  return <BoxIcon className={className} />;
}
