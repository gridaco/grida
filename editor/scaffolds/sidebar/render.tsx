"use client";

import React from "react";
import { ResourceTypeIcon } from "@/components/resource-type-icon";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type {
  MenuGroup,
  MenuItem,
  MenuSeparator,
  TMenuData,
} from "../editor/menu";
import { SidebarMenuLinkButton } from "./sidebar-menu-link-button";

export function renderMenuGroup<T extends TMenuData>(
  menu: MenuGroup<T>,
  props?: {
    onSelect?: (item: MenuItem<T>) => void;
    renderGroupHeader?: (props: { menu: MenuGroup<T> }) => React.ReactNode;
    renderEmptyState?: () => React.ReactNode;
    renderMenuItem?: (props: {
      item: MenuItem<T>;
      onSelect?: () => void;
    }) => React.ReactNode;
  }
) {
  const { onSelect, renderGroupHeader, renderEmptyState, renderMenuItem } =
    props ?? {};

  return (
    <SidebarGroup>
      {renderGroupHeader ? (
        renderGroupHeader({ menu })
      ) : (
        <SidebarGroupLabel>
          <span>{menu.label}</span>
        </SidebarGroupLabel>
      )}
      <SidebarGroupContent>
        {!menu.children.length && renderEmptyState ? (
          renderEmptyState?.()
        ) : (
          <></>
        )}
        <SidebarMenu>
          {menu.children.map((item: MenuItem<T> | MenuSeparator, i) => {
            if (item.type === "separator") {
              return <hr key={i} />;
            }
            return (
              <SidebarMenuItem key={item.id}>
                {renderMenuItem ? (
                  renderMenuItem({ item, onSelect: () => onSelect?.(item) })
                ) : (
                  <SidebarMenuLinkButton
                    size="sm"
                    // data-level={item.level}
                    disabled={item.disabled}
                    link={item.link}
                    onClick={() => {
                      onSelect?.(item);
                    }}
                  >
                    {item.icon && (
                      <ResourceTypeIcon type={item.icon} className="size-4" />
                    )}
                    {item.label}
                  </SidebarMenuLinkButton>
                )}
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
