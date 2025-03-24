"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTable } from "@/components/data-table/data-table";
import { useEffect, useMemo, useState } from "react";
import { createClientWestClient } from "@/lib/supabase/client";
import { Platform } from "@/lib/platform";
import { Badge } from "@/components/ui/badge";
import toast from "react-hot-toast";
import { OpenInNewWindowIcon } from "@radix-ui/react-icons";
import { ImportFromCustomersDialog } from "@/scaffolds/platform/customer/import-from-customers-dialog";
import { useDialogState } from "@/components/hooks/use-dialog-state";

const columns: ColumnDef<Platform.WEST.ParticipantCustomer>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "role",
    header: "Role",
    cell: ({ row }) => <div>{row.getValue("role")}</div>,
  },
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => <div>{row.getValue("name")}</div>,
  },
  {
    accessorKey: "email",
    header: "Email",
    cell: ({ row }) => <div>{row.getValue("email")}</div>,
  },
  {
    accessorKey: "phone",
    header: "Phone",
    cell: ({ row }) => <div>{row.getValue("phone")}</div>,
  },
  {
    id: "actions",
    enableHiding: false,
    cell: ({ row }) => {
      const item = row.original;

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-56">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => {
                toast.success("Copied ID to clipboard");
                navigator.clipboard.writeText(item.id);
              }}
            >
              Copy ID
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>View owner</DropdownMenuItem>
            <DropdownMenuItem>View details</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];

function useParticipants(series_id: string) {
  const [tokens, setTokens] = useState<
    Platform.WEST.ParticipantCustomer[] | null
  >(null);
  const client = useMemo(() => createClientWestClient(), []);

  useEffect(() => {
    client
      .from("participant_customer")
      .select("*")
      .eq("series_id", series_id)
      .then(({ data, error }) => {
        if (error) return;
        setTokens(data as Platform.WEST.ParticipantCustomer[]);
      });
  }, [client, series_id]);

  return { tokens };
}

export function ParticipantsTable({ series_id }: { series_id: string }) {
  const importCustomersDialog = useDialogState("import-customers", {
    refreshkey: true,
  });
  const { tokens } = useParticipants(series_id);
  //

  const onImport = async (ids: string[]) => {
    return await fetch(`/west/s/${series_id}/participants/import`, {
      method: "POST",
      body: JSON.stringify({
        role: "host",
        customer_ids: ids,
      } satisfies Platform.WEST.ImportParticipantsRequestBody),
    }).then((res) => {
      return res.ok;
    });
  };

  return (
    <div>
      <ImportFromCustomersDialog
        key={importCustomersDialog.refreshkey}
        {...importCustomersDialog.props}
        onImport={onImport}
      />
      <Button onClick={importCustomersDialog.openDialog}>Import</Button>
      <DataTable columns={columns} data={tokens ?? []} />
    </div>
  );
}

// function ImportParticipants()
