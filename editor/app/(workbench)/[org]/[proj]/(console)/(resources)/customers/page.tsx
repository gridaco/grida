"use client";

import * as GridLayout from "@/scaffolds/grid-editor/components/layout";
import { useMemo } from "react";
import {
  deleteCustomers,
  insertCustomer,
} from "@/scaffolds/platform/customer/use-customer-feed";
import {
  createBrowserClient,
  createBrowserCIAMClient,
} from "@/lib/supabase/client";
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
import { ChevronDownIcon, UploadIcon } from "@radix-ui/react-icons";
import { useProject } from "@/scaffolds/workspace";
import { useDialogState } from "@/components/hooks/use-dialog-state";
import { ImportCSVDialog } from "@/scaffolds/platform/customer/import-csv-dialog";
import { usePathname, useRouter } from "next/navigation";
import { subscribeTable } from "@/lib/supabase/realtime";
import CustomerCreateDialog from "@/scaffolds/platform/customer/customer-edit-dialog";
import { toast } from "sonner";
import { Platform } from "@/lib/platform";
import { DeleteSelectionButton } from "@/scaffolds/grid-editor/components/delete";
import { useTags } from "@/scaffolds/workspace";
import {
  CustomerTable,
  useCustomerTable,
} from "@/scaffolds/grid/wellknown/customer-grid";

export default function Customers() {
  return <CustomerTablePage />;
}

function CustomerTablePage() {
  const project = useProject();
  const client = useMemo(() => createBrowserClient(), []);

  const subscriber = useMemo(
    () =>
      (callbacks: {
        onInsert?: (data: Platform.Customer.CustomerWithTags) => void;
        onUpdate?: (data: Platform.Customer.CustomerWithTags) => void;
        onDelete?: (
          data: Platform.Customer.CustomerWithTags | Record<string, unknown>
        ) => void;
      }) => {
        const subscription = subscribeTable(
          client,
          `project-customers-realtime-${project.id}`,
          {
            event: "*",
            table: "customer",
            filter: `project_id=eq.${project.id}`,
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
    [client, project.id]
  );

  return (
    <CustomerTable.Provider realtime subscriber={subscriber}>
      <Body />
    </CustomerTable.Provider>
  );
}

function Body() {
  const project = useProject();
  const router = useRouter();
  const pathname = usePathname();
  const client = useMemo(() => createBrowserClient(), []);
  const { selection, clearSelection, hasSelection, tablespace } =
    useCustomerTable();

  const onDeleteCustomers = (ids: string[]) => {
    const task = deleteCustomers(client, project.id, ids);
    toast.promise(task, {
      loading: "Deleting customers...",
      success: "Customers deleted",
      error: (err) => {
        console.error("Failed to delete customers", err);
        return "Failed to delete customers";
      },
    });
    task.finally(() => {
      clearSelection();
      tablespace.onRefresh();
    });
  };

  return (
    <GridLayout.Root>
      <GridLayout.Header>
        <GridLayout.HeaderLine>
          <GridLayout.HeaderMenus>
            {hasSelection ? (
              <CustomerTable.SelectionBar>
                <DeleteSelectionButton
                  count={selection.size}
                  keyword={"customer"}
                  onDeleteClick={() => {
                    onDeleteCustomers(Array.from(selection));
                  }}
                />
              </CustomerTable.SelectionBar>
            ) : (
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
                  <CustomerTable.Toolbar />
                </GridLayout.HeaderMenuItems>
              </div>
            )}
          </GridLayout.HeaderMenus>
          <GridLayout.HeaderMenus>
            <NewButton
              onNewData={() => {
                tablespace.onRefresh();
              }}
            />
          </GridLayout.HeaderMenus>
        </GridLayout.HeaderLine>
        <CustomerTable.FilterChips />
        <CustomerTable.LoadingLine />
      </GridLayout.Header>
      <GridLayout.Content>
        <CustomerTable.Grid
          onCellDoubleClick={(row) => {
            router.push(`${pathname}/${row.uid}`);
          }}
        />
      </GridLayout.Content>
      <GridLayout.Footer>
        <CustomerTable.Footer />
      </GridLayout.Footer>
    </GridLayout.Root>
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
          onNewData?.();
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
