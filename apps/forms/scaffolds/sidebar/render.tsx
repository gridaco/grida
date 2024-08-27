"use client";

import React, { useMemo } from "react";
import {
  SidebarMenuItem,
  SidebarMenuItemActions,
  SidebarMenuLink,
  SidebarMenuList,
  SidebarSection,
  SidebarSectionHeaderItem,
  SidebarSectionHeaderLabel,
} from "@/components/sidebar";
import { MenuItem } from "@/scaffolds/editor/state";
import { ResourceTypeIcon } from "@/components/resource-type-icon";

import "core-js/features/map/group-by";

export function renderMenuItems(
  items: MenuItem<any>[],
  props?: {
    onSelect?: (item: MenuItem<any>) => void;
    renderFallback?: () => React.ReactNode;
    renderSectionHeader?: (props: { section: string }) => React.ReactNode;
    renderEmptyState?: () => React.ReactNode;
    renderItemActions?: (item: MenuItem<any>) => React.ReactNode;
  }
) {
  const {
    onSelect,
    renderSectionHeader,
    renderEmptyState,
    renderFallback,
    renderItemActions,
  } = props ?? {};
  const sections: Map<string, Array<MenuItem<any>>> = useMemo(
    () => Map.groupBy(items, (item: MenuItem<any>) => item.section),
    [items]
  );

  if (!sections.size) {
    return renderFallback ? renderFallback() : <></>;
  }

  return (
    <>
      {Array.from(sections.keys()).map((section) => {
        const items = sections.get(section);
        return (
          <SidebarSection key={section}>
            {renderSectionHeader ? (
              renderSectionHeader({ section })
            ) : (
              <SidebarSectionHeaderItem>
                <SidebarSectionHeaderLabel>
                  <span>{section}</span>
                </SidebarSectionHeaderLabel>
              </SidebarSectionHeaderItem>
            )}
            <SidebarMenuList>
              {renderEmptyState && items?.length === 0 ? (
                renderEmptyState?.()
              ) : (
                <></>
              )}
              {items?.map((item: MenuItem<any>, i) => (
                <SidebarMenuLink key={item.id} href={item.href ?? ""}>
                  <SidebarMenuItem
                    muted
                    level={item.level}
                    onSelect={() => {
                      onSelect?.(item);
                    }}
                  >
                    <ResourceTypeIcon
                      type={item.icon}
                      className="w-4 h-4 me-2 inline"
                    />
                    {item.label}
                    {renderItemActions && (
                      <SidebarMenuItemActions>
                        {renderItemActions(item)}
                      </SidebarMenuItemActions>
                    )}
                  </SidebarMenuItem>
                </SidebarMenuLink>
              ))}
            </SidebarMenuList>
          </SidebarSection>
        );
      })}
    </>
  );
}
