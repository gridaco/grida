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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useDialogState } from "@/components/hooks/use-dialog-state";
import { useForm, Controller } from "react-hook-form";
import toast from "react-hot-toast";
import { PrivateEditorApi } from "@/lib/private";
import { useRouter } from "next/navigation";
import { renderMenuItems } from "./render";

export function ModeData() {
  const [state] = useEditorState();

  const { document_id, basepath, tables } = state;

  const newTableDialog = useDialogState<CreateNewTableDialogInit>();

  function AddActionDropdownMenu() {
    return (
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
              New Empty Table
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <ResourceTypeIcon type="table" className="w-4 h-4 me-2" />
                Examples
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem
                  onSelect={() => {
                    newTableDialog.openDialog({
                      name: "blog",
                      description: "A blog table",
                      template: "cms-blog-starter",
                    });
                  }}
                >
                  <ResourceTypeIcon type="table" className="w-4 h-4 me-2" />
                  Blog
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    newTableDialog.openDialog({
                      name: "collection",
                      description: "A collection table",
                      template: "cms-starter",
                    });
                  }}
                >
                  <ResourceTypeIcon type="table" className="w-4 h-4 me-2" />
                  CMS Starter
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
    );
  }

  function EmptyState() {
    return (
      <div className="py-4 border border-dashed rounded-sm flex flex-col gap-2 items-center justify-center w-full">
        <span className="text-center">
          <h4 className="text-muted-foreground text-xs font-bold">No tables</h4>
          <p className="text-muted-foreground text-xs">
            Create your first table
          </p>
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => newTableDialog.openDialog({})}
        >
          <PlusIcon className="w-4 h-4 me-2" />
          New Table
        </Button>
      </div>
    );
  }

  return (
    <>
      <CreateNewTableDialog {...newTableDialog} key={newTableDialog.key} />
      {renderMenuItems(state.sidebar.mode_data.tables, {
        renderEmptyState: () => <EmptyState />,
        renderSectionHeader: ({ section }) => (
          <SidebarSectionHeaderItem>
            <SidebarSectionHeaderLabel>
              <span>Tables</span>
            </SidebarSectionHeaderLabel>
            {state.doctype == "v0_schema" && (
              <SidebarMenuItemActions>
                <AddActionDropdownMenu />
              </SidebarMenuItemActions>
            )}
          </SidebarSectionHeaderItem>
        ),
      })}
      {renderMenuItems(state.sidebar.mode_data.menus)}
    </>
  );
}

type CreateNewTableDialogInit = Partial<{
  name: string;
  description: string;
  template: "cms-starter" | "cms-blog-starter";
}>;

function CreateNewTableDialog({
  data,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  data?: CreateNewTableDialogInit;
}) {
  const router = useRouter();
  const [state, dispatch] = useEditorState();
  const {
    control,
    handleSubmit,
    formState: { isSubmitting, isSubmitSuccessful },
  } = useForm({
    defaultValues: {
      name: data?.name || "",
      description: data?.description,
      template: data?.template,
    },
  });

  const onSubmit = handleSubmit(
    async (data: {
      name: string;
      description?: string;
      template?: CreateNewTableDialogInit["template"];
    }) => {
      const promise = PrivateEditorApi.Schema.createTable({
        schema_id: state.document_id, // document_id is schema_id in v0_schema doctype
        table_name: data.name,
        description: data.description || undefined,
        template: data.template,
      });

      toast.promise(promise, {
        loading: "Creating table...",
        success: "Table created",
        error: "Failed to create table",
      });

      promise.then(({ data: { data } }) => {
        if (!data) return;
        dispatch({
          type: "editor/schema/table/add",
          table: data,
        });

        // TODO: needs to handle routing in order to make the menu item to be focused
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
