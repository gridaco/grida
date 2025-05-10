"use client";

import * as React from "react";
import { ColumnDef, CellContext } from "@tanstack/react-table";
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
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { createBrowserWestReferralClient } from "@/lib/supabase/client";
import { Platform } from "@/lib/platform";
import { Badge } from "@/components/ui/badge";
import { ImportFromCustomersDialog } from "@/scaffolds/platform/customer/import-from-customers-dialog";
import { useDialogState } from "@/components/hooks/use-dialog-state";
import { MoreHorizontal } from "lucide-react";
import { OpenInNewWindowIcon } from "@radix-ui/react-icons";
import { useCampaign } from "../store";
import { useProject } from "@/scaffolds/workspace";
import { documentpreviewlink } from "@/lib/internal/url";
import { useExportCSV } from "@/scaffolds/platform/data/use-export-csv";
import { DownloadIcon } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";

type ReferrerWithCustomer = Platform.WEST.Referral.Referrer & {
  customer: Platform.WEST.Referral.Customer;
};

function ActionsCell({ row }: CellContext<ReferrerWithCustomer, unknown>) {
  const referrer = row.original;

  const project = useProject();
  const { id } = useCampaign();

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
            const link = documentpreviewlink({
              org: project.organization_id,
              proj: project.id,
              docid: id,
              path: `/t/${referrer.code}`,
            });
            open(link, "_blank");
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
        <DropdownMenuItem disabled>View participant details</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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
    cell: ActionsCell,
  },
];

function useReferrers(campaign_id: string) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [referrers, setReferrers] = useState<ReferrerWithCustomer[] | null>(
    null
  );
  const client = useMemo(() => createBrowserWestReferralClient(), []);

  const refresh = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

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
        setReferrers(data as ReferrerWithCustomer[]);
      });
  }, [client, campaign_id, refreshKey]);

  return { referrers, refresh };
}

function useReferrersExport(campaign_id: string) {
  const client = useMemo(() => createBrowserWestReferralClient(), []);

  return useExportCSV<ReferrerWithCustomer>({
    fetchData: async (page, pageSize) => {
      const { data, error, count } = await client
        .from("referrer")
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
        data: data as ReferrerWithCustomer[],
        count: count || 0,
      };
    },
    transformToCSV: (referrer) => [
      referrer.code,
      referrer.customer.uid || "-",
      referrer.customer.name || "-",
      referrer.customer.phone || "-",
      referrer.customer.email || "-",
      referrer.created_at,
      referrer.invitation_count.toString(),
    ],
    headers: [
      "code",
      "customer.uid",
      "customer.name",
      "customer.phone",
      "customer.email",
      "created_at",
      "invitation_count",
    ],
    pageSize: 100,
  });
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
          <DialogTitle>Export Referrers</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {error && <div className="text-red-500 text-sm">{error}</div>}
          {isExporting ? (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">
                Exporting all referrers... {Math.min(progress, 100)}%
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
                Export all referrers to a CSV file. The export will include all
                referrer details including customer information.
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

export function ReferrersTable() {
  const campaign = useCampaign();
  const importCustomersDialog = useDialogState("import-customers", {
    refreshkey: true,
  });
  const exportDialog = useDialogState("export-referrers", {
    refreshkey: true,
  });
  const { referrers, refresh } = useReferrers(campaign.id);
  const exporter = useReferrersExport(campaign.id);

  const onImport = async (ids: string[]) => {
    return await fetch(
      `/private/west/campaigns/${campaign.id}/participants/import`,
      {
        method: "POST",
        body: JSON.stringify({
          role: "referrer",
          customer_ids: ids,
        } satisfies Platform.WEST.Referral.ImportParticipantsRequestBody),
      }
    )
      .then((res) => {
        return res.ok;
      })
      .finally(() => {
        // refresh the participants
        refresh();
      });
  };

  return (
    <div>
      <ImportFromCustomersDialog
        key={importCustomersDialog.refreshkey}
        {...importCustomersDialog.props}
        onImport={onImport}
      />
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
          <Button onClick={importCustomersDialog.openDialog}>Import</Button>
        </div>
      </header>
      <DataTable columns={columns} data={referrers ?? []} />
    </div>
  );
}
