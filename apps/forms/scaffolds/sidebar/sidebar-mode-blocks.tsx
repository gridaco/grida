"use client";

import React from "react";
import { useEditorState } from "../editor";
import {
  SidebarMenuItem,
  SidebarMenuLink,
  SidebarMenuList,
  SidebarSection,
  SidebarSectionHeaderItem,
  SidebarSectionHeaderLabel,
} from "@/components/sidebar";
import { ResourceTypeIcon } from "@/components/resource-type-icon";
import { usePathname } from "next/navigation";
import "core-js/features/map/group-by";

export function ModeDesign() {
  const [state, dispatch] = useEditorState();

  const pathname = usePathname();

  const {
    document: { pages },
  } = state;

  const sections = Map.groupBy(pages, (page) => page.section);

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
            {sections.get(section)?.map((page) => (
              <SidebarMenuLink key={page.id} href={page.href ?? ""}>
                <SidebarMenuItem muted level={page.level}>
                  <ResourceTypeIcon
                    type={page.icon}
                    className="w-4 h-4 me-2 inline"
                  />
                  {page.label}
                </SidebarMenuItem>
              </SidebarMenuLink>
              // <Link key={page.id} href={page.href ?? ""}>
              //   <SidebarMenuItem
              //     level={page.level}
              //     selected={pathname === page.href}
              //   >
              //     <ResourceTypeIcon
              //       type={page.icon}
              //       className="w-4 h-4 me-2 inline"
              //     />
              //     {page.label}
              //   </SidebarMenuItem>
              // </Link>
            ))}
          </SidebarMenuList>
        </SidebarSection>
      ))}
    </>
  );
}
