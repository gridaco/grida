"use client";

import { CustomerGrid } from "@/scaffolds/grid/wellknown/customer-grid";
import {
  GridQueryLimitSelect,
  GridRefreshButton,
  DataQueryTextSearch,
  GridQueryCount,
  GridQueryPaginationControl,
  GridLoadingProgressLine,
  DataQueryPredicatesMenu,
  DataQueryPredicatesMenuTriggerButton,
  DataQueryOrderByMenu,
  DataQueryOrderbyMenuTriggerButton,
} from "@/scaffolds/grid-editor/components";
import * as GridLayout from "@/scaffolds/grid-editor/components/layout";
import { useMemo, useState } from "react";
import {
  deleteCustomers,
  fetchCustomers,
  insertCustomer,
} from "@/scaffolds/platform/customer/use-customer-feed";
import { useTableSpaceInstance } from "@/scaffolds/data-table";
import {
  createBrowserClient,
  createBrowserCIAMClient,
} from "@/lib/supabase/client";
import {
  DataPlatformProvider,
  PredicateConfigProvider,
  SchemaNameProvider,
  StandaloneDataQueryProvider,
  TableDefinitionProvider,
  type PredicateConfig,
} from "@/scaffolds/data-query";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResourceTypeIcon } from "@/components/resource-type-icon";
import { Button } from "@/components/ui/button";
import {
  ButtonGroup,
  ButtonGroupSeparator,
} from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDownIcon, Cross2Icon, UploadIcon } from "@radix-ui/react-icons";
import { useProject } from "@/scaffolds/workspace";
import { useDialogState } from "@/components/hooks/use-dialog-state";
import { ImportCSVDialog } from "@/scaffolds/platform/customer/import-csv-dialog";
import { usePathname, useRouter } from "next/navigation";
import { subscribeTable } from "@/lib/supabase/realtime";
import { cn } from "@/components/lib/utils";
import CustomerCreateDialog from "@/scaffolds/platform/customer/customer-edit-dialog";
import { toast } from "sonner";
import { Platform } from "@/lib/platform";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { TableQueryChips } from "@/scaffolds/grid-editor/components/query/query-chips";
import { txt_n_plural } from "@/utils/plural";
import { DeleteSelectionButton } from "@/scaffolds/grid-editor/components/delete";
import { useTags } from "@/scaffolds/workspace";

export default function Customers() {
  return (
    <>
      <StandaloneDataQueryProvider>
        <Body />
      </StandaloneDataQueryProvider>
    </>
  );
}

function Body() {
  const project = useProject();
  const project_id = project.id;
  const router = useRouter();
  const pathname = usePathname();
  const client = useMemo(() => createBrowserClient(), []);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const { tags: projectTags } = useTags();
  const tagOptions = useMemo(
    () => projectTags.map((t) => ({ value: t.name, color: t.color })),
    [projectTags]
  );
  const predicateConfig = useMemo<PredicateConfig>(
    () => ({
      getEnumOptions: (meta) => {
        if (meta.name === "tags" && meta.array && meta.scalar_format === "text")
          return tagOptions;
        return undefined;
      },
      getDefaultPredicate: (meta) => {
        if (meta.name === "tags" && meta.array && meta.scalar_format === "text")
          return { op: "ov" };
        return undefined;
      },
    }),
    [tagOptions]
  );

  const has_selected_rows = selection.size > 0;

  const onClearSelection = () => {
    setSelection(new Set());
  };

  // TODO: remove the realtime - or at least disable when importing from csv (swr will be enough)
  const ciamClient = useMemo(() => createBrowserCIAMClient(), []);
  const tablespace = useTableSpaceInstance<Platform.Customer.CustomerWithTags>({
    identifier: "uid",
    readonly: false,
    realtime: true,
    fetcher: (q) => fetchCustomers(ciamClient, project_id, q),
    subscriber: (callbacks) => {
      const subscription = subscribeTable(
        client,
        `project-customers-realtime-${project_id}`,
        {
          event: "*",
          table: "customer",
          filter: `project_id=eq.${project_id}`,
          schema: "public",
        },
        {
          onDelete: callbacks.onDelete,
          onInsert: callbacks.onInsert as (data: unknown) => void,
          onUpdate: callbacks.onUpdate as (data: unknown) => void,
        }
      );

      return () => {
        subscription.unsubscribe();
      };
    },
  });

  const onDeleteCustomers = (ids: string[]) => {
    const task = deleteCustomers(client, project_id, ids);
    toast.promise(task, {
      loading: "Deleting customers...",
      success: "Customers deleted",
      error: (err) => {
        console.error("Failed to delete customers", err);
        return "Failed to delete customers";
      },
    });
    task.finally(() => {
      onClearSelection();
      tablespace.onRefresh();
    });
  };

  return (
    <DataPlatformProvider
      platform={{
        provider: "grida",
      }}
    >
      <PredicateConfigProvider config={predicateConfig}>
        <SchemaNameProvider schema={undefined}>
          <TableDefinitionProvider definition={Platform.Customer.TABLE}>
            <GridLayout.Root>
              <GridLayout.Header>
                <GridLayout.HeaderLine>
                  <GridLayout.HeaderMenus>
                    {has_selected_rows ? (
                      <div
                        className={cn(
                          "flex items-center",
                          !has_selected_rows ? "hidden" : ""
                        )}
                      >
                        <div className="flex gap-2 items-center">
                          <div className="flex items-center gap-1.5">
                            <Button
                              size="icon"
                              variant="outline"
                              className="size-7"
                              onClick={onClearSelection}
                            >
                              <Cross2Icon />
                            </Button>
                            <span
                              className="text-sm font-norma text-muted-foreground"
                              aria-label="selected responses"
                            >
                              {txt_n_plural(selection.size, "customer")}{" "}
                              selected
                            </span>
                          </div>
                          <GridLayout.HeaderSeparator />
                          {/* <SelectionExport /> */}
                          {/* <GridLayout.HeaderSeparator /> */}
                          <DeleteSelectionButton
                            count={selection.size}
                            keyword={"customer"}
                            onDeleteClick={() => {
                              onDeleteCustomers(
                                Array.from(selection.values()).map((v) => v)
                              );
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-center items-center divide-x *:px-2 *:first:pl-0 *:last:pr-0">
                          <Tabs defaultValue="default">
                            <TabsList>
                              <TabsTrigger value="default">
                                <ResourceTypeIcon
                                  type={"user"}
                                  className="inline align-middle w-4 min-size-4"
                                />
                                Customer
                              </TabsTrigger>
                            </TabsList>
                          </Tabs>
                          <GridLayout.HeaderMenuItems>
                            <DataQueryPredicatesMenu {...tablespace}>
                              <DataQueryPredicatesMenuTriggerButton
                                active={tablespace.isPredicatesSet}
                              />
                            </DataQueryPredicatesMenu>
                            <DataQueryOrderByMenu {...tablespace}>
                              <DataQueryOrderbyMenuTriggerButton
                                active={tablespace.isOrderbySet}
                              />
                            </DataQueryOrderByMenu>
                            <DataQueryTextSearch
                              placeholder="Type to search"
                              onValueChange={(v) => {
                                if (v.trim()) {
                                  tablespace.onTextSearch(
                                    Platform.Customer.TABLE_SEARCH_TEXT,
                                    v.trim()
                                  );
                                } else {
                                  tablespace.onTextSearchClear();
                                }
                              }}
                              debounce={500}
                            />
                          </GridLayout.HeaderMenuItems>
                        </div>
                      </>
                    )}
                  </GridLayout.HeaderMenus>
                  <GridLayout.HeaderMenus>
                    {/* <ViewSettings /> */}
                    <NewButton
                      onNewData={() => {
                        tablespace.onRefresh();
                      }}
                    />
                  </GridLayout.HeaderMenus>
                </GridLayout.HeaderLine>
                {(tablespace.isPredicatesSet || tablespace.isOrderbySet) && (
                  <GridLayout.HeaderLine className="border-b-0 px-0">
                    <ScrollArea>
                      <ScrollBar
                        orientation="horizontal"
                        className="invisible"
                      />
                      <div className="px-2">
                        <TableQueryChips {...tablespace} />
                      </div>
                    </ScrollArea>
                  </GridLayout.HeaderLine>
                )}
                <GridLoadingProgressLine loading={tablespace.loading} />
              </GridLayout.Header>
              <GridLayout.Content>
                <CustomerGrid
                  loading={tablespace.loading}
                  tokens={
                    tablespace.q_text_search
                      ? [tablespace.q_text_search?.query]
                      : []
                  }
                  // TODO:
                  // masked={state.datagrid_local_filter.masking_enabled}
                  // dateformat=""
                  // datetz=''
                  selectedRows={new Set(selection)}
                  onSelectedRowsChange={setSelection}
                  rows={tablespace.stream || []}
                  onCellDoubleClick={(row) => {
                    router.push(`${pathname}/${row.uid}`);
                    //
                  }}
                />
              </GridLayout.Content>
              <GridLayout.Footer>
                <GridQueryPaginationControl {...tablespace} />
                <GridQueryLimitSelect
                  value={tablespace.limit}
                  onValueChange={tablespace.onLimit}
                />
                <GridQueryCount
                  count={tablespace.estimated_count}
                  keyword="customer"
                />
                <GridRefreshButton
                  refreshing={tablespace.loading}
                  onRefreshClick={tablespace.onRefresh}
                />
              </GridLayout.Footer>
            </GridLayout.Root>
          </TableDefinitionProvider>
        </SchemaNameProvider>
      </PredicateConfigProvider>
    </DataPlatformProvider>
  );
}

function NewButton({ onNewData }: { onNewData?: () => void }) {
  const project = useProject();
  const project_id = project.id;
  const ciamClient = useMemo(() => createBrowserCIAMClient(), []);
  const { tags: allTags } = useTags();
  const createCustomerDialog = useDialogState("create-customer", {
    refreshkey: true,
  });

  const importCSVDialog = useDialogState("import-from-csv", {
    refreshkey: true,
  });

  const onDefaultClick = () => {
    createCustomerDialog.openDialog();
  };

  const onImportFromCSVClick = () => {
    importCSVDialog.openDialog();
  };

  return (
    <div className="flex items-center gap-1">
      <CustomerCreateDialog
        {...createCustomerDialog.props}
        key={createCustomerDialog.refreshkey}
        tagOptions={allTags.map((t) => t.name)}
        onSubmit={async (data) => {
          const { error } = await insertCustomer(ciamClient, project_id, {
            ...data,
          });

          if (error) {
            console.error("Failed to create customer", error);
            toast.error("Failed to create customer");
            return false;
          }
          return true;
        }}
      />
      <ImportCSVDialog
        {...importCSVDialog.props}
        key={importCSVDialog.refreshkey}
        onImportComplete={() => {
          onNewData?.();
        }}
      />
      <ButtonGroup className="rounded-md shadow-sm">
        <Button onClick={onDefaultClick} size="sm" type="button">
          New
        </Button>
        <ButtonGroupSeparator />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label="New options" size="icon-sm" type="button">
              <ChevronDownIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="end">
            <DropdownMenuItem onSelect={onImportFromCSVClick}>
              <UploadIcon />
              Import from CSV
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>
    </div>
  );
}
