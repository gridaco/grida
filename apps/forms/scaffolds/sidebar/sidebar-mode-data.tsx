"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  DotsHorizontalIcon,
  EyeOpenIcon,
  GearIcon,
  Pencil1Icon,
  PlusIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
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
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
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
import Link from "next/link";
import { editorlink } from "@/lib/forms/url";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { TypeSelect } from "@/components/formfield-type-select";
import { GridaXSupabaseTypeMap } from "@/lib/x-supabase/typemap";
import {
  DeleteConfirmationAlertDialog,
  DeleteConfirmationSnippet,
} from "@/components/delete-confirmation-dialog";
import { SupabasePostgRESTOpenApi } from "@/lib/supabase-postgrest";
import { FormInputType } from "@/types";
import { Badge } from "@/components/ui/badge";

export function ModeData() {
  const [state, dispatch] = useEditorState();

  const { document_id, basepath, tables } = state;

  const newTableDialog = useDialogState<CreateNewTableDialogInit>(
    "new-table-dialog",
    {
      refreshkey: true,
    }
  );
  const newXSBTableDialog = useDialogState("new-xsb-table-dialog", {
    refreshkey: true,
  });
  const deleteTableDialog = useDialogState<{
    id: string;
    match: string;
  }>("delete-table-dialog", { refreshkey: true });

  const router = useRouter();

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
            {state.supabase_project && (
              <DropdownMenuItem onSelect={newXSBTableDialog.openDialog}>
                <SupabaseLogo className="w-4 h-4 me-2" />
                Connect Table
              </DropdownMenuItem>
            )}

            <Link
              href={editorlink("connect/database/supabase", {
                basepath: basepath,
                document_id: document_id,
              })}
            >
              <DropdownMenuItem>
                <SupabaseLogo className="w-4 h-4 me-2" />
                {state.supabase_project ? "View" : "Configure"}
              </DropdownMenuItem>
            </Link>
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

  function Header() {
    return (
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
    );
  }

  return (
    <>
      <DeleteConfirmationAlertDialog
        title="Delete Table"
        description={
          <>
            This action cannot be undone. All records will be deleted within
            Grida (If you are using external datasource, the origin data will
            stay untouched). Type{" "}
            <DeleteConfirmationSnippet>
              {deleteTableDialog.data?.match}
            </DeleteConfirmationSnippet>{" "}
            to delete this table
          </>
        }
        placeholder={deleteTableDialog.data?.match}
        match={deleteTableDialog.data?.match}
        onDelete={async ({ id }, user_confirmation_txt) => {
          try {
            await PrivateEditorApi.Schema.deleteTable({
              schema_id: state.document_id,
              table_id: id,
              user_confirmation_txt: user_confirmation_txt,
            });

            dispatch({
              type: "editor/schema/table/delete",
              table_id: id,
            });

            // redirect to data home (otherwise app might crash)
            router.replace(
              editorlink("data", {
                basepath: state.basepath,
                document_id: state.document_id,
              })
            );

            return true;
          } catch (e) {
            toast.error("Failed to delete table");
            return false;
          }
        }}
        {...deleteTableDialog}
        key={deleteTableDialog.refreshkey}
      />
      <ConnectNewSupabaseTableDialog
        {...newXSBTableDialog}
        key={newXSBTableDialog.refreshkey}
      />
      <CreateNewSchemaTableDialog
        {...newTableDialog}
        key={newTableDialog.refreshkey}
      />
      {renderMenuItems(state.sidebar.mode_data.tables, {
        renderEmptyState: () => <EmptyState />,
        renderFallback: () => {
          return (
            <SidebarSection>
              <Header />
              <SidebarMenuList>
                <EmptyState />
              </SidebarMenuList>
            </SidebarSection>
          );
        },
        renderSectionHeader: Header,
        renderMenuItem: ({ item, onSelect }) => (
          <SidebarMenuItem muted level={item.level} onSelect={onSelect}>
            <ResourceTypeIcon
              type={item.icon}
              className="w-4 h-4 min-w-4 me-2 inline"
            />
            {item.label}
            {item.data.readonly && (
              <EyeOpenIcon className="w-4 h-4 ms-2 inline text-muted-foreground" />
            )}
            <SidebarMenuItemActions>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuItemAction>
                    <DotsHorizontalIcon />
                  </SidebarMenuItemAction>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="end">
                  <DropdownMenuItem disabled>
                    <Pencil1Icon className="me-2" />
                    Rename Table
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => {
                      deleteTableDialog.openDialog({
                        id: item.id as string,
                        // TODO: use safe value - name.
                        match: `DELETE ${item.label}`,
                      });
                    }}
                  >
                    <TrashIcon className="me-2" />
                    Delete Table
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItemActions>
          </SidebarMenuItem>
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

function CreateNewSchemaTableDialog({
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
    formState: { isSubmitting },
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

        // close
        props.onOpenChange?.(false);

        router.push(
          editorlink("data/table/[tablename]", {
            basepath: state.basepath,
            document_id: state.document_id,
            tablename: data.name,
          })
        );
      });
    }
  );

  const onSaveClick = () => {
    onSubmit();
  };

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
            <Button variant="outline">Cancel</Button>
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

function ConnectNewSupabaseTableDialog({
  ...props
}: React.ComponentProps<typeof Dialog>) {
  const router = useRouter();
  const [state, dispatch] = useEditorState();
  const { supabase_project } = state;

  const [fulltable, setFullTable] = useState<`${string}.${string}`>();
  const [attributes_as, set_attributes_as] = useState<
    Record<
      string,
      {
        enabled?: boolean;
        value?: FormInputType;
        options?: FormInputType[];
      }
    >
  >({});

  const tableSchema = useMemo(() => {
    if (!fulltable) return;
    const [schema, name] = fulltable.split(".");
    return supabase_project?.sb_schema_definitions?.[schema]?.[name];
  }, [supabase_project?.sb_schema_definitions, fulltable]);

  useEffect(() => {
    if (!tableSchema) return;
    //
    const result = Object.fromEntries(
      Object.keys(tableSchema.properties).map((key) => {
        const property = tableSchema.properties[key];
        const suggestion = GridaXSupabaseTypeMap.getSuggestion({
          type: property.type,
          format: property.format,
          enum: property.enum,
          is_array: property.is_array,
        });

        return [
          key,
          {
            enabled: true,
            value: suggestion?.default,
            options: suggestion?.suggested,
          },
        ] as const;
      })
    );

    set_attributes_as(result);
  }, [tableSchema]);

  const onConnectClick = () => {
    if (!fulltable) return;
    const [schema, name] = fulltable.split(".");

    const promise = PrivateEditorApi.Schema.createTableWithXSBTable({
      schema_id: state.document_id, // document_id is schema_id in v0_schema doctype
      sb_schema_name: schema,
      sb_table_name: name,
      connect_attributes_as: Object.fromEntries(
        Object.entries(attributes_as)
          .map(([key, value]) => {
            return [key, { type: value.value }];
          })
          .filter(([key]) => key)
      ),
    });

    toast.promise(promise, {
      loading: "Creating table...",
      success: "Table created",
      error: "Failed to create table",
    });

    promise.then(({ data: { data } }) => {
      if (!data) return;

      const parsed =
        SupabasePostgRESTOpenApi.parse_supabase_postgrest_schema_definition(
          data.connection.sb_table_schema
        );

      dispatch({
        type: "editor/schema/table/add",
        table: {
          ...data.table,
          x_sb_main_table_connection: {
            sb_table_id: data.connection.sb_table_id,
            sb_schema_name: data.connection.sb_schema_name,
            sb_table_name: data.connection.sb_table_name,
            sb_table_schema: data.connection.sb_table_schema,
            sb_postgrest_methods: data.connection.sb_postgrest_methods,
            pks: parsed.pks,
            pk: parsed.pks[0],
          },
        },
      });

      // close
      props.onOpenChange?.(false);

      router.push(
        editorlink("data/table/[tablename]", {
          basepath: state.basepath,
          document_id: state.document_id,
          tablename: data.table.name,
        })
      );
    });
  };

  return (
    <Dialog {...props}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            <SupabaseLogo className="w-5 h-5 me-2 inline-flex" />
            Connect Supabase Table
          </DialogTitle>
          <DialogDescription>
            Connect a table from your{" "}
            <Link
              className="underline"
              href={editorlink("connect/database/supabase", {
                basepath: state.basepath,
                document_id: state.document_id,
              })}
            >
              Supabase project
              <GearIcon className="ml-0.5 inline-flex" />
            </Link>
          </DialogDescription>
        </DialogHeader>

        {/*  */}
        <div className="my-4">
          <Select
            value={fulltable}
            // @ts-expect-error
            onValueChange={setFullTable}
          >
            <SelectTrigger>
              <SelectValue placeholder={"Select Table"} />
            </SelectTrigger>
            <SelectContent>
              {Object.keys(supabase_project?.sb_schema_definitions || {}).map(
                (schemaName) => {
                  return (
                    <SelectGroup key={schemaName}>
                      <SelectLabel>{schemaName}</SelectLabel>
                      {Object.keys(
                        supabase_project?.sb_schema_definitions?.[schemaName] ||
                          {}
                      ).map((tableName) => {
                        const fulltable = `${schemaName}.${tableName}`;
                        const openapidoc =
                          supabase_project!.sb_schema_openapi_docs[schemaName];

                        const readonly =
                          SupabasePostgRESTOpenApi.table_is_get_only(
                            openapidoc,
                            tableName
                          );

                        return (
                          <SelectItem key={fulltable} value={fulltable}>
                            <span>
                              {fulltable}{" "}
                              {readonly && (
                                <Badge
                                  variant="outline"
                                  className="text-xs font-mono"
                                >
                                  READONLY
                                </Badge>
                              )}
                            </span>
                          </SelectItem>
                        );
                      })}
                      <SelectSeparator />
                    </SelectGroup>
                  );
                }
              )}
            </SelectContent>
          </Select>

          {fulltable && tableSchema && (
            <>
              <hr />
              <div className="mt-4 border-y">
                <ScrollArea className="h-96">
                  <div className="divide-y">
                    {Object.keys(tableSchema.properties).map((key) => {
                      const property = tableSchema.properties[key];
                      const { enabled, value, options } =
                        attributes_as[key] ?? {};
                      return (
                        <div key={key} className="flex items-center gap-2 h-14">
                          <div className="min-w-8">
                            <Checkbox
                              checked={enabled}
                              onCheckedChange={(checked) => {
                                set_attributes_as((prev) => {
                                  return {
                                    ...prev,
                                    [key]: {
                                      ...prev[key],
                                      enabled: checked === true,
                                    },
                                  };
                                });
                              }}
                            />
                          </div>
                          <div className="flex-1 grid gap-1 font-mono">
                            <Label className="overflow-hidden text-ellipsis">
                              {key}
                            </Label>
                            <span className="overflow-hidden text-ellipsis text-xs text-muted-foreground">
                              {property.format}
                            </span>
                          </div>
                          <div className="w-56">
                            <TypeSelect
                              value={value}
                              options={options?.map((t) => ({
                                value: t,
                              }))}
                              onValueChange={(value) => {
                                set_attributes_as((prev) => {
                                  return {
                                    ...prev,
                                    [key]: {
                                      ...prev[key],
                                      value: value,
                                    },
                                  };
                                });
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            </>
          )}
        </div>
        {/*  */}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button disabled={!fulltable} onClick={onConnectClick}>
            Connect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
