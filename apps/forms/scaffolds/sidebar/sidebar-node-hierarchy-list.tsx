"use client";

import { useDocument } from "@/builder";
import { SidebarMenuItem, SidebarMenuItemLabel } from "@/components/sidebar";
import {
  FrameIcon,
  BoxIcon,
  ComponentInstanceIcon,
  ImageIcon,
  TextIcon,
  TransformIcon,
} from "@radix-ui/react-icons";
import { grida } from "@/grida";

export function NodeHierarchyList() {
  const {
    state: { document, selected_node_id, hovered_node_id },
    selectNode,
    pointerEnterNode,
  } = useDocument();

  // TODO: need nested nodes for templates

  const ids = Object.keys(document.nodes);
  return (
    <>
      {ids.map((id) => {
        const n = document.nodes[id];
        const selected = selected_node_id === n.id;
        const hovered = hovered_node_id === n.id;
        return (
          <SidebarMenuItem
            key={n.id}
            muted
            hovered={hovered}
            level={1}
            selected={selected}
            onSelect={() => {
              selectNode(n.id);
            }}
            icon={<NodeHierarchyItemIcon type={n.type} className="w-4 h-4" />}
            onPointerEnter={() => {
              pointerEnterNode(n.id);
            }}
            onPointerLeave={() => {
              pointerEnterNode(n.id);
            }}
          >
            <SidebarMenuItemLabel>{n.name}</SidebarMenuItemLabel>
          </SidebarMenuItem>
        );
      })}
    </>
  );
}

function NodeHierarchyItemIcon({
  className,
  type,
}: {
  type: grida.program.nodes.Node["type"];
  className?: string;
}) {
  switch (type) {
    case "container":
      return <FrameIcon className={className} />;
    case "image":
      return <ImageIcon className={className} />;
    case "text":
      return <TextIcon className={className} />;
    case "instance":
      return <ComponentInstanceIcon className={className} />;
    case "svg":
      return <TransformIcon className={className} />;
  }
  return <BoxIcon className={className} />;
}
