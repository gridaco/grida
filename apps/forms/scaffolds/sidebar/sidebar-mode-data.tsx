"use client";

import React from "react";
import { PlusIcon } from "@radix-ui/react-icons";
import { useEditorState } from "../editor";
import { SupabaseLogo } from "@/components/logos";
import {
  SidebarMenuItem,
  SidebarMenuItemAction,
  SidebarMenuItemActions,
  SidebarMenuLink,
  SidebarMenuList,
  SidebarSection,
  SidebarSectionHeaderItem,
  SidebarSectionHeaderLabel,
} from "@/components/sidebar";
import { TableTypeIcon } from "@/components/table-type-icon";
import { ResourceTypeIcon } from "@/components/resource-type-icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FormEditorState } from "@/scaffolds/editor/state";

export function ModeData() {
  const [state] = useEditorState();

  const { document_id, basepath, tables } = state;

  return (
    <>
      <SidebarSection>
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>
            <span>Tables</span>
          </SidebarSectionHeaderLabel>
          <SidebarMenuItemActions>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuItemAction>
                  <PlusIcon />
                </SidebarMenuItemAction>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="start">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>CMS</DropdownMenuLabel>
                  <DropdownMenuItem>
                    <ResourceTypeIcon type="table" className="w-4 h-4 me-2" />
                    New Table
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Supabase</DropdownMenuLabel>
                  <DropdownMenuItem>
                    <SupabaseLogo className="w-4 h-4 me-2" />
                    Existing Table
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItemActions>
        </SidebarSectionHeaderItem>
        <SidebarMenuList>
          {tables.map((table, i) => {
            return (
              <SidebarMenuLink
                key={i}
                href={tablehref(basepath, document_id, table.group)}
              >
                <SidebarMenuItem muted>
                  <TableTypeIcon
                    type={table.group}
                    className="inline align-middle w-4 h-4 me-2"
                  />
                  {table.name}
                </SidebarMenuItem>
              </SidebarMenuLink>
            );
          })}
          {/* <li>
          <Link href="#">
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
            <span>Analytics</span>
          </SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuList>
          <SidebarMenuLink href={`/${basepath}/${document_id}/data/analytics`}>
            <SidebarMenuItem
              muted
              icon={<ResourceTypeIcon type="chart" className="w-4 h-4" />}
            >
              Realtime
            </SidebarMenuItem>
          </SidebarMenuLink>
        </SidebarMenuList>
      </SidebarSection>

      {/* <label className="text-xs text-muted-foreground py-4 px-4">
        Commerce
      </label>
      <li>
        <Link
          href={editorlink("connect/store/orders", {
            org: organization.name,
            proj: project.name,
            form_id,
          })}
        >
          <SideNavItem>
            <ArchiveIcon />
            Orders
          </SideNavItem>
        </Link>
      </li>
      <li>
        <Link
          href={editorlink("connect/store/products", {
            org: organization.name,
            proj: project.name,
            form_id,
          })}
        >
          <SideNavItem>
            <ArchiveIcon />
            Inventory
          </SideNavItem>
        </Link>
      </li> */}
    </>
  );
}

function tablehref(
  basepath: string,
  document_id: string,
  type: FormEditorState["tables"][number]["group"]
) {
  switch (type) {
    case "response":
      return `/${basepath}/${document_id}/data/responses`;
    case "customer":
      return `/${basepath}/${document_id}/data/customers`;
    case "x-supabase-main-table":
      return `/${basepath}/${document_id}/data/responses`;
    case "x-supabase-auth.users":
      return `/${basepath}/${document_id}/data/x/auth.users`;
  }
}
