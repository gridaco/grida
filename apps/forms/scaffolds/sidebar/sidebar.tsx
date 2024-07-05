"use client";

import { AvatarIcon, PieChartIcon } from "@radix-ui/react-icons";
import Link from "next/link";
import { useEditorState } from "../editor";
import { Table2Icon, TabletSmartphoneIcon } from "lucide-react";
import {
  SidebarMenuItem,
  SidebarMenuList,
  SidebarRoot,
  SidebarSection,
  SidebarSectionHeaderItem,
  SidebarSectionHeaderLabel,
} from "@/components/sidebar";

export function Siebar() {
  const [state] = useEditorState();

  const { form_id } = state;
  return (
    <SidebarRoot>
      <SidebarSection>
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>
            <span>Table</span>
          </SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuList>
          <Link href={`/d/${form_id}/data/responses`}>
            <SidebarMenuItem muted>
              <Table2Icon className="inline align-middle w-4 h-4 me-2" />
              Form
            </SidebarMenuItem>
          </Link>
          <Link href={`/d/${form_id}/data/customers`}>
            <SidebarMenuItem muted>
              <AvatarIcon className="inline align-middle w-4 h-4 me-2" />
              Customers
            </SidebarMenuItem>
          </Link>
          {/* <li>
          <Link href={`/d/${form_id}/data/files`}>
            <SideNavItem>
              <FileIcon className="w-4 h-4" />
              Files
            </SideNavItem>
          </Link>
        </li> */}
        </SidebarMenuList>
      </SidebarSection>
      <SidebarSection>
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>
            <span>App / Campaign</span>
          </SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuList>
          <Link href={`/d/${form_id}/blocks`}>
            <SidebarMenuItem muted>
              <TabletSmartphoneIcon className="inline align-middle w-4 h-4 me-2" />
              Main
            </SidebarMenuItem>
          </Link>
        </SidebarMenuList>
      </SidebarSection>
      {/* <label className="text-xs text-muted-foreground py-4 px-4">
          Commerce
        </label>
        <li>
          <Link href={`/d/${form_id}/connect/store/orders`}>
            <SideNavItem>
              <ArchiveIcon />
              Orders
            </SideNavItem>
          </Link>
        </li>
        <li>
          <Link href={`/d/${form_id}/connect/store/products`}>
            <SideNavItem>
              <ArchiveIcon />
              Inventory
            </SideNavItem>
          </Link>
        </li> */}
      <SidebarSection>
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>
            <span>Analytics</span>
          </SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuList>
          <Link href={`/d/${form_id}/data/analytics`}>
            <SidebarMenuItem muted>
              <PieChartIcon className="inline align-middle w-4 h-4 me-2" />
              Realtime
            </SidebarMenuItem>
          </Link>
        </SidebarMenuList>
      </SidebarSection>
    </SidebarRoot>
  );
}
