"use client";

import React, { useEffect } from "react";
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FormEditorState, TableGroup } from "@/scaffolds/editor/state";
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
import { Button } from "@/components/ui/button";
import { useDialogState } from "@/components/hooks/use-dialog-state";
import { useForm, Controller } from "react-hook-form";
import toast from "react-hot-toast";

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
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <ResourceTypeIcon
                          type="table"
                          className="w-4 h-4 me-2"
                        />
                        Examples
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        <DropdownMenuItem>
                          <ResourceTypeIcon
                            type="table"
                            className="w-4 h-4 me-2"
                          />
                          Blog
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
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
          {tables.length === 0 && (
            <div className="py-4 border border-dashed rounded-sm flex flex-col gap-2 items-center justify-center w-full">
              <span className="text-center">
                <h4 className="text-muted-foreground text-xs font-bold">
                  No tables
                </h4>
                <p className="text-muted-foreground text-xs">
                  Create your first table
                </p>
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={newTableDialog.openDialog}
              >
                <PlusIcon className="w-4 h-4 me-2" />
                New Table
              </Button>
            </div>
          )}
          {tables.map((table, i) => {
            return (
              <SidebarMenuLink
                key={i}
                href={tablehref(basepath, document_id, table)}
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
      {state.doctype == "v0_form" && (
        <SidebarSection>
          <SidebarSectionHeaderItem>
            <SidebarSectionHeaderLabel>
              <span>Analytics</span>
            </SidebarSectionHeaderLabel>
          </SidebarSectionHeaderItem>
          <SidebarMenuList>
            <SidebarMenuLink
              href={`/${basepath}/${document_id}/data/analytics`}
            >
              <SidebarMenuItem
                muted
                icon={<ResourceTypeIcon type="chart" className="w-4 h-4" />}
              >
                Realtime
              </SidebarMenuItem>
            </SidebarMenuLink>
          </SidebarMenuList>
        </SidebarSection>
      )}

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
  table: {
    group: TableGroup;
    name: string;
  }
) {
  switch (table.group) {
    case "response":
      return `/${basepath}/${document_id}/data/responses`;
    case "customer":
      return `/${basepath}/${document_id}/data/customers`;
    case "schema":
      return `/${basepath}/${document_id}/data/table/${table.name}`;
    case "x-supabase-main-table":
      return `/${basepath}/${document_id}/data/responses`;
    case "x-supabase-auth.users":
      return `/${basepath}/${document_id}/data/x/auth.users`;
  }
}

function CreateNewTableDialog({
  ...props
}: React.ComponentProps<typeof Dialog>) {
  const [state, dispatch] = useEditorState();
  const {
    control,
    handleSubmit,
    formState: { isSubmitting, isSubmitSuccessful },
  } = useForm({
    defaultValues: {
      name: "",
      description: "",
    },
  });

  const onSubmit = handleSubmit(
    async (data: { name: string; description: string }) => {
      toast.success("Table created");
      dispatch({
        type: "editor/schema/table/add",
        table: data.name,
      });
    }
  );

  const onSaveClick = () => {
    onSubmit();
  };

  useEffect(() => {
    if (isSubmitSuccessful) {
      // close
      props.onOpenChange?.(false);
    }
  }, [isSubmitSuccessful]);

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
        <div className="py-4 space-y-4">
          <div className="grid gap-2">
            <Label>Name</Label>
            <Controller
              name="name"
              control={control}
              render={({ field }) => (
                <Input placeholder="table_name" {...field} />
              )}
            />
          </div>
          <div className="grid gap-2">
            <Label>Description</Label>
            <Controller
              name="description"
              control={control}
              render={({ field }) => (
                <Input placeholder="Optional" {...field} />
              )}
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button value="ghost">Cancel</Button>
          </DialogClose>
          <Button disabled={isSubmitting} onClick={onSaveClick}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
      {/*  */}
    </Dialog>
  );
}
