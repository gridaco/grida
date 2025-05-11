"use client";

import React from "react";
import { ColumnDef, CellContext } from "@tanstack/react-table";
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
import { useEffect, useMemo, useState, useCallback } from "react";
import { createBrowserWestReferralClient } from "@/lib/supabase/client";
import { Platform } from "@/lib/platform";
import { Badge } from "@/components/ui/badge";
import { OpenInNewWindowIcon } from "@radix-ui/react-icons";
import { useCampaign } from "../store";
import { useProject } from "@/scaffolds/workspace";
import { documentpreviewlink } from "@/lib/internal/url";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useDialogState } from "@/components/hooks/use-dialog-state";
import { useExportCSV } from "@/scaffolds/platform/data/use-export-csv";
import { DownloadIcon } from "lucide-react";

type InvitationWithCustomer = Platform.WEST.Referral.Invitation & {
  customer: Platform.WEST.Referral.Customer;
};

function ActionsCell({
  row,
}: CellContext<Platform.WEST.Referral.Invitation, unknown>) {
  const invitation = row.original;

  const campaign = useCampaign();
  const project = useProject();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="size-8 p-0">
          <span className="sr-only">Open menu</span>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuItem
          onClick={() => {
            toast.success("Copied token ID to clipboard");
            navigator.clipboard.writeText(invitation.id);
          }}
        >
          Copy ID
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            const link = documentpreviewlink({
              org: project.organization_id,
              proj: project.id,
              docid: campaign.id,
              path: `/t/${invitation.code}`,
            });
            open(link, "_blank");
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
}

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
    cell: ActionsCell,
  },
];

function useInvitations(campaign_id: string) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [invitations, setInvitations] = useState<
    InvitationWithCustomer[] | null
  >(null);
  const client = useMemo(() => createBrowserWestReferralClient(), []);

  const refresh = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    client
      .from("invitation")
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
        setInvitations(data as InvitationWithCustomer[]);
      });
  }, [client, campaign_id, refreshKey]);

  return { invitations, refresh };
}

function ExportDialog({
  onExport,
  isExporting,
  progress,
  error,
  isComplete,
  ...props
}: {
  onExport: () => void;
  isExporting: boolean;
  progress: number;
  error: string | null;
  isComplete: boolean;
} & React.ComponentProps<typeof Dialog>) {
  const isStale = !isExporting && !isComplete;

  return (
    <Dialog {...props}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export Invitations</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {error && <div className="text-red-500 text-sm">{error}</div>}
          {isExporting ? (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">
                Exporting all invitations... {Math.min(progress, 100)}%
              </div>
              <Progress value={Math.min(progress, 100)} />
            </div>
          ) : isComplete ? (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">
                All done! Your export is complete.
              </div>
              <Progress value={100} />
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Export all invitations to a CSV file. The export will include
                all invitation details including customer information.
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          {isStale && (
            <Button onClick={onExport} className="w-full">
              Start Export
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function useInvitationsExport(campaign_id: string) {
  const client = useMemo(() => createBrowserWestReferralClient(), []);

  return useExportCSV<InvitationWithCustomer>({
    fetchData: async (page, pageSize) => {
      const { data, error, count } = await client
        .from("invitation")
        .select(
          `
          *,
          customer:customer(*)
        `,
          { count: "exact" }
        )
        .eq("campaign_id", campaign_id)
        .order("created_at", { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);

      if (error) throw error;
      return {
        data: data as InvitationWithCustomer[],
        count: count || 0,
      };
    },
    transformToCSV: (invitation) => [
      invitation.code,
      invitation.referrer_id || "-",
      invitation.customer?.uid || "-",
      invitation.customer?.name || "-",
      invitation.customer?.phone || "-",
      invitation.customer?.email || "-",
      invitation.created_at,
    ],
    headers: [
      "code",
      "referrer_id",
      "customer.uid",
      "customer.name",
      "customer.phone",
      "customer.email",
      "created_at",
    ],
  });
}

export function InvitationsTable() {
  const campaign = useCampaign();
  const exportDialog = useDialogState("export-invitations", {
    refreshkey: true,
  });
  const { invitations } = useInvitations(campaign.id);
  const exporter = useInvitationsExport(campaign.id);

  return (
    <div>
      <ExportDialog
        key={exportDialog.refreshkey}
        {...exportDialog.props}
        onExport={exporter.exportToCSV}
        isExporting={exporter.isExporting}
        progress={exporter.progress}
        error={exporter.error}
        isComplete={exporter.isComplete}
      />
      <header className="w-full flex justify-between items-center mb-4">
        <div />
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              exporter.reset();
              exportDialog.openDialog();
            }}
          >
            <DownloadIcon className="size-4 me-2" />
            Export CSV
          </Button>
        </div>
      </header>
      <DataTable columns={columns} data={invitations ?? []} />
    </div>
  );
}
