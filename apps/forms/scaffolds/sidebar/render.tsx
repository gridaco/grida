"use client";

import React, { useMemo } from "react";
import {
  SidebarMenuItem,
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
  onSelect?: (item: MenuItem<any>) => void
) {
  const sections: Map<string, Array<MenuItem<any>>> = useMemo(
    () =>
      // @ts-expect-error core-js
      Map.groupBy(items, (item: MenuItem<any>) => item.section),
    [items]
  );

  return (
    <>
      {Array.from(sections.keys()).map((section) => (
        <SidebarSection key={section}>
          <SidebarSectionHeaderItem>
            <SidebarSectionHeaderLabel>
              <span>{section}</span>
            </SidebarSectionHeaderLabel>
          </SidebarSectionHeaderItem>
          <SidebarMenuList>
            {sections.get(section)?.map((item: MenuItem<any>, i) => (
              <SidebarMenuLink key={i} href={item.href ?? ""}>
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
                </SidebarMenuItem>
              </SidebarMenuLink>
            ))}
          </SidebarMenuList>
        </SidebarSection>
      ))}
    </>
  );
}
