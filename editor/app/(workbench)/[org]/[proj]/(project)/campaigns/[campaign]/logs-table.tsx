"use client";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import useSWR from "swr";
import { Spinner } from "@/components/spinner";
import { Platform } from "@/lib/platform";

export default function LogsTable({ campaign_id }: { campaign_id: string }) {
  const { data, isLoading } = useSWR<{
    data: Platform.WEST.Referral.TokenEvent[];
  }>(
    `/private/west/campaigns/${campaign_id}/events`,
    async (url) => {
      const res = await fetch(url);
      return res.json();
    },
    {
      refreshInterval: 1000 * 30,
    }
  );

  if (isLoading) {
    return (
      <>
        <Spinner />
      </>
    );
  }

  const logs = data?.data ?? [];

  // // Format timestamp to a more readable format
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[180px]">Timestamp</TableHead>
            <TableHead className="w-[100px]">Type</TableHead>
            <TableHead>Data</TableHead>
            <TableHead className="w-[200px]">Token</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(logs?.length ?? 0 > 0) ? (
            logs.map((log, i) => (
              <TableRow key={i}>
                <TableCell className="font-mono text-xs">
                  {formatTimestamp(log.time)}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{log.name}</Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  <pre>{JSON.stringify(log.data)}</pre>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  <pre className="text-ellipsis">{log.token_id}</pre>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={4} className="h-24 text-center">
                No logs found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
