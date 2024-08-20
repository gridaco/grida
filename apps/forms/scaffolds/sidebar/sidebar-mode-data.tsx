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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button";
import { useDialogState } from "@/components/hooks/use-dialog-state";

export function ModeData() {
  const [state] = useEditorState();

  const { document_id, basepath, tables } = state;

  const newTableDialog = useDialogState();

  return (
    <>
      <SidebarSection>
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>
            <span>Tables</span>
          </SidebarSectionHeaderLabel>
          {state.doctype == "v0_schema" && (
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
                    <DropdownMenuItem onSelect={newTableDialog.openDialog}>
                      <ResourceTypeIcon type="table" className="w-4 h-4 me-2" />
                      New Table
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Supabase</DropdownMenuLabel>
                    <DropdownMenuItem>
                      <SupabaseLogo className="w-4 h-4 me-2" />
                      Connect Supabase Table
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <SupabaseLogo className="w-4 h-4 me-2" />
                      Connect Supabase Project
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItemActions>
          )}
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
      <CreateNewTableDialog {...newTableDialog} />
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

function CreateNewTableDialog({
  ...props
}: React.ComponentProps<typeof Dialog>) {
  return (
    <Dialog {...props}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex gap-2 items-center">
            <ResourceTypeIcon type="table" className="w-5 h-5" />
            Create New CMS Table
          </DialogTitle>
        </DialogHeader>
        {/*  */}
        <div className="grid gap-2">
          <Label>Name</Label>
          <Input placeholder="table_name" />
        </div>
        <div className="grid gap-2">
          <Label>Description</Label>
          <Input placeholder="Optional" />
        </div>
        <DialogFooter>
          <DialogClose className={buttonVariants({ variant: "ghost" })}>
            Cancel
          </DialogClose>
          <DialogClose className={buttonVariants({ variant: "default" })}>
            Save
          </DialogClose>
        </DialogFooter>
      </DialogContent>
      {/*  */}
    </Dialog>
  );
}
