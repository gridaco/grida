import * as React from "react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
} from "@/components/ui/sidebar";
import { ChevronRight, File, Folder } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { MenuItem } from "../editor/menu";
import { ResourceTypeIcon } from "@/components/resource-type-icon";

import type { MenuGroup } from "../editor/menu";
import { SidebarMenuLinkButton } from "./sidebar-menu-link-button";

export function SidebarMenuGroup({
  menu,
  selection,
}: {
  menu: MenuGroup<{ id: string }>;
  selection?: string[];
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{menu.label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {menu.children.map((item, index) => {
            const key =
              item.type === "separator"
                ? `separator-${index}`
                : item.id ?? `item-${index}`;

            return item.type === "separator" ? (
              <hr key={key} />
            ) : (
              <Tree key={key} item={item} selection={selection} />
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function Tree({
  item,
  selection,
}: {
  item: MenuItem<{ id: string }>;
  selection?: string[];
}) {
  const { id, label, icon } = item;

  if (item.type === "item") {
    return (
      <SidebarMenuLinkButton
        size="sm"
        link={item.link}
        isActive={selection?.includes(id)}
        disabled={item.disabled}
        className="data-[active=true]:bg-transparent"
      >
        {icon ? <ResourceTypeIcon type={icon} /> : <File />}
        <span className="truncate select-none">{label}</span>
      </SidebarMenuLinkButton>
    );
  }

  return (
    <SidebarMenuItem>
      <Collapsible
        defaultOpen={item.defaultOpen}
        className="group/collapsible [&[data-state=open]>button>svg:first-child]:rotate-90"
      >
        <CollapsibleTrigger asChild>
          <SidebarMenuLinkButton
            link={item.link}
            disabled={item.disabled}
            size="sm"
          >
            <ChevronRight className="transition-transform" />
            <Folder />
            <span className="truncate select-none">{label}</span>
          </SidebarMenuLinkButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub className="mx-0 ms-3.5">
            {item.children.map((subItem, index) => (
              <Tree
                key={subItem.id ?? `subitem-${index}`}
                item={subItem}
                selection={selection}
              />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
}
