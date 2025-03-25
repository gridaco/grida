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

const columns: ColumnDef<Platform.WEST.Token>[] = [
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
    accessorKey: "code",
    header: "Code",
    cell: ({ row }) => (
      <div>
        <Badge className="font-mono text-xs">{row.getValue("code")}</Badge>
      </div>
    ),
  },
  {
    accessorKey: "token_type",
    header: () => <div>Type</div>,
    cell: ({ row }) => (
      <div>
        <Badge variant="outline">{row.getValue("token_type")}</Badge>
      </div>
    ),
  },
  {
    accessorKey: "owner_id",
    header: () => <div>Owner</div>,
    cell: ({ row }) => <div>{row.getValue("owner_id")}</div>,
  },
  {
    accessorKey: "is_claimed",
    header: "Claimed",
    cell: ({ row }) => (
      <div>
        <Checkbox disabled checked={row.getValue("is_claimed")} />
      </div>
    ),
  },
  {
    accessorKey: "is_burned",
    header: "Burned",
    cell: ({ row }) => (
      <div>
        <Checkbox disabled checked={row.getValue("is_burned")} />
      </div>
    ),
  },
  {
    accessorKey: "max_supply",
    header: () => <div>Max</div>,
    cell: ({ row }) => <div>{row.getValue("max_supply")}</div>,
  },
  {
    accessorKey: "count",
    header: () => <div>Mint</div>,
    cell: ({ row }) => <div>{row.getValue("count")}</div>,
  },
  {
    id: "actions",
    enableHiding: false,
    cell: ({ row }) => {
      const token = row.original;

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
                toast.success("Copied token ID to clipboard");
                navigator.clipboard.writeText(token.id);
              }}
            >
              Copy ID
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                open(`/r/${token.series_id}/${token.code}`, "_blank");
              }}
            >
              <OpenInNewWindowIcon className="size-4 me-2" />
              Open URL
            </DropdownMenuItem>
            <DropdownMenuItem disabled>View owner</DropdownMenuItem>
            <DropdownMenuItem disabled>View details</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];

function useTokens(series_id: string) {
  const [tokens, setTokens] = useState<Platform.WEST.Token[] | null>(null);
  const client = useMemo(() => createClientWestClient(), []);

  useEffect(() => {
    client
      .from("token")
      .select(
        `
        *,
        owner:participant_customer!owner_id(*)
      `
      )
      .eq("series_id", series_id)
      .then(({ data, error }) => {
        if (error) return;
        setTokens(data as Platform.WEST.Token[]);
      });
  }, [client, series_id]);

  return { tokens };
}

export function TokensTable({ campaign_id }: { campaign_id: string }) {
  const { tokens } = useTokens(campaign_id);

  //

  return <DataTable columns={columns} data={tokens ?? []} />;
}
