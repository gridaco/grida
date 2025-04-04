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
import { createClientWestReferralClient } from "@/lib/supabase/client";
import { Platform } from "@/lib/platform";
import { Badge } from "@/components/ui/badge";
import toast from "react-hot-toast";
import { OpenInNewWindowIcon } from "@radix-ui/react-icons";

const columns: ColumnDef<Platform.WEST.Referral.Invitation>[] = [
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
    accessorKey: "customer_id",
    header: () => <div>Invitee</div>,
    cell: ({ row }) => <div>{row.getValue("customer_id")}</div>,
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
                open(`/r/${token.campaign_id}/${token.code}`, "_blank");
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

function useInvitations(campaign_id: string) {
  const [invitations, setInvitations] = useState<
    Platform.WEST.Referral.Invitation[] | null
  >(null);
  const client = useMemo(() => createClientWestReferralClient(), []);

  useEffect(() => {
    client
      .from("invitation")
      .select(
        `
        *
      `
      )
      .eq("campaign_id", campaign_id)
      .then(({ data, error }) => {
        if (error) return;
        setInvitations(data as Platform.WEST.Referral.Invitation[]);
      });
  }, [client, campaign_id]);

  return { invitations };
}

export function InvitationsTable({ campaign_id }: { campaign_id: string }) {
  const { invitations } = useInvitations(campaign_id);

  return <DataTable columns={columns} data={invitations ?? []} />;
}
