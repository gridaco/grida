"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
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
import { createClientWestReferralClient } from "@/lib/supabase/client";
import { Platform } from "@/lib/platform";
import { Badge } from "@/components/ui/badge";
import { ImportFromCustomersDialog } from "@/scaffolds/platform/customer/import-from-customers-dialog";
import { useDialogState } from "@/components/hooks/use-dialog-state";
import { MoreHorizontal } from "lucide-react";
import { OpenInNewWindowIcon } from "@radix-ui/react-icons";
import Link from "next/link";
import toast from "react-hot-toast";

type ReferrerWithCustomer = Platform.WEST.Referral.Referrer & {
  customer: Platform.WEST.Referral.Customer;
};

const columns: ColumnDef<ReferrerWithCustomer>[] = [
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
    accessorKey: "customer.name",
    header: "Name",
    cell: ({ row }) => {
      return (
        <span>
          {row.original.customer.name ||
            row.original.customer.email ||
            row.original.customer.phone ||
            "-"}
        </span>
      );
    },
  },
  {
    accessorKey: "code",
    header: "Code",
    cell: ({ row }) => (
      <div>
        <Badge variant="outline">{row.getValue("code")}</Badge>
      </div>
    ),
  },
  {
    accessorKey: "customer.email",
    header: "Email",
    cell: ({ row }) => {
      return <span>{row.original.customer.email || "-"}</span>;
    },
  },
  {
    id: "actions",
    enableHiding: false,
    cell: ({ row }) => {
      const referrer = row.original;

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
                open(`/r/${referrer.campaign_id}/${referrer.code}`, "_blank");
              }}
            >
              <OpenInNewWindowIcon className="size-4 me-2" />
              Open URL
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                toast.success("Copied ID to clipboard");
                navigator.clipboard.writeText(referrer.customer_id);
              }}
            >
              Copy Customer ID
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <Link href={`../customers/${referrer.customer_id}`}>
              <DropdownMenuItem>View customer details</DropdownMenuItem>
            </Link>
            <DropdownMenuItem disabled>
              View participant details
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];

function useReferrers(campaign_id: string) {
  const [participants, setParticipants] = useState<
    ReferrerWithCustomer[] | null
  >(null);
  const client = useMemo(() => createClientWestReferralClient(), []);

  useEffect(() => {
    client
      .from("referrer")
      .select(
        `
          *,
          customer:customer(*)
        `
      )
      .eq("campaign_id", campaign_id)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) return;
        setParticipants(data as ReferrerWithCustomer[]);
      });
  }, [client, campaign_id]);

  return { tokens: participants };
}

export function ReferrersTable({ campaign_id }: { campaign_id: string }) {
  const importCustomersDialog = useDialogState("import-customers", {
    refreshkey: true,
  });
  const { tokens } = useReferrers(campaign_id);
  //

  const onImport = async (ids: string[]) => {
    return await fetch(
      `/private/west/campaigns/${campaign_id}/participants/import`,
      {
        method: "POST",
        body: JSON.stringify({
          role: "referrer",
          customer_ids: ids,
        } satisfies Platform.WEST.Referral.ImportParticipantsRequestBody),
      }
    ).then((res) => {
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
      <header className="w-full flex justify-between items-center mb-4">
        <div />
        <Button onClick={importCustomersDialog.openDialog}>Import</Button>
      </header>
      <DataTable columns={columns} data={tokens ?? []} />
    </div>
  );
}
