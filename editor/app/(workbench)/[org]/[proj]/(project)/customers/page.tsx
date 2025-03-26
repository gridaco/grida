"use client";

import { CustomerGrid } from "@/scaffolds/grid/wellknown/customer-grid";
import {
  GridQueryLimitSelect,
  GridRefreshButton,
  DataQueryTextSearch,
  GridQueryCount,
  GridQueryPaginationControl,
  GridLoadingProgressLine,
} from "@/scaffolds/grid-editor/components";
import * as GridLayout from "@/scaffolds/grid-editor/components/layout";
import { useMemo } from "react";
import {
  fetchCustomers,
  insertCustomer,
} from "@/scaffolds/platform/customer/use-customer-feed";
import { useTableSpaceInstance } from "@/scaffolds/data-table";
import { createClientWorkspaceClient } from "@/lib/supabase/client";
import { StandaloneDataQueryProvider } from "@/scaffolds/data-query";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResourceTypeIcon } from "@/components/resource-type-icon";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDownIcon, GearIcon, UploadIcon } from "@radix-ui/react-icons";
import { useProject } from "@/scaffolds/workspace";
import { useDialogState } from "@/components/hooks/use-dialog-state";
import { ImportCSVDialog } from "@/scaffolds/platform/customer/import-csv-dialog";
import { usePathname, useRouter } from "next/navigation";
import { subscribeTable } from "@/lib/supabase/realtime";
import { Badge } from "@/components/ui/badge";
import { DateFormatRadioGroup } from "@/scaffolds/data-format/ui/date-format";
import { DateTimeZoneRadioGroup } from "@/scaffolds/data-format/ui/date-timezone";
import { cn } from "@/utils";
import CustomerEditDialog from "@/scaffolds/platform/customer/customer-edit-dialog";
import toast from "react-hot-toast";
import type { Platform } from "@/lib/platform";

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
  const client = useMemo(() => createClientWorkspaceClient(), []);

  const tablespace = useTableSpaceInstance<Platform.Customer.CustomerWithTags>({
    identifier: "uid",
    readonly: false,
    realtime: true,
    fetcher: (q) => fetchCustomers(client, project_id, q),
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

  return (
    <GridLayout.Root>
      <GridLayout.Header>
        <GridLayout.HeaderLine>
          <GridLayout.HeaderMenus>
            <Tabs defaultValue="default">
              <TabsList>
                <TabsTrigger value="default">
                  <ResourceTypeIcon
                    type={"user"}
                    className="inline align-middle w-4 min-w-4 h-4 me-2"
                  />
                  Customer
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <DataQueryTextSearch onValueChange={tablespace.onTextSearchQuery} />
          </GridLayout.HeaderMenus>
          <GridLayout.HeaderMenus>
            <ViewSettings />
            <NewButton />
          </GridLayout.HeaderMenus>
        </GridLayout.HeaderLine>
        <GridLoadingProgressLine loading={tablespace.loading} />
      </GridLayout.Header>
      <GridLayout.Content>
        <CustomerGrid
          loading={tablespace.loading}
          tokens={
            tablespace.q_text_search ? [tablespace.q_text_search?.query] : []
          }
          // masked={state.datagrid_local_filter.masking_enabled}
          // dateformat=""
          // datetz=''
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
        <GridQueryCount count={tablespace.estimated_count} keyword="customer" />
        <GridRefreshButton
          refreshing={tablespace.loading}
          onRefreshClick={tablespace.onRefresh}
        />
      </GridLayout.Footer>
    </GridLayout.Root>
  );
}

function NewButton() {
  const project = useProject();
  const project_id = project.id;
  const client = useMemo(() => createClientWorkspaceClient(), []);
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
      <CustomerEditDialog
        {...createCustomerDialog.props}
        key={createCustomerDialog.refreshkey}
        operation="insert"
        onSubmit={async (data) => {
          const { error } = await insertCustomer(client, project_id, data);
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
      />
      <div role="group" className="inline-flex rounded-md shadow-sm">
        <button
          type="button"
          onClick={onDefaultClick}
          className={cn(
            buttonVariants({ variant: "default", size: "sm" }),
            "border rounded-s-lg rounded-e-none focus:z-10 focus:ring-2",
            "gap-2"
          )}
        >
          New
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                buttonVariants({ variant: "default", size: "sm" }),
                "pl-1.5 pr-1.5 py-1 border-t border-b border-r rounded-s-none rounded-e-lg focus:z-10 focus:ring-2"
              )}
            >
              <ChevronDownIcon />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="end">
            <DropdownMenuItem onSelect={onImportFromCSVClick}>
              <UploadIcon className="me-2" />
              Import from CSV
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function ViewSettings() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center justify-center">
          <Badge variant="outline" className="cursor-pointer">
            <GearIcon />
          </Badge>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel>View Options</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel
          inset
          className="text-xs text-muted-foreground font-normal"
        >
          Data Consistency & Protection
        </DropdownMenuLabel>
        <DropdownMenuCheckboxItem
        // checked={datagrid_filter.masking_enabled}
        // onCheckedChange={(checked) => {
        //   dispatch({
        //     type: "editor/data-grid/local-filter",
        //     masking_enabled: checked,
        //   });
        // }}
        >
          Mask data{" "}
          <span className="inline ms-2 text-muted-foreground text-xs">
            Locally
          </span>
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {/*  */}
        {/* date format */}
        <DropdownMenuLabel
          inset
          className="text-xs text-muted-foreground font-normal"
        >
          Date Format
        </DropdownMenuLabel>
        <DateFormatRadioGroup
          value="datetime"
          // value={dateformat}
          onValueChange={(value) => {
            //
          }}
        />

        <DropdownMenuSeparator />
        <DropdownMenuLabel
          inset
          className="text-xs text-muted-foreground font-normal"
        >
          Date Timezone
        </DropdownMenuLabel>
        {/* tz */}
        <DateTimeZoneRadioGroup
          value="UTC"
          // value={dateformat}
          onValueChange={(value) => {
            //
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
