"use client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useDatagridTableSpace, useEditorState } from "../editor";
import { InfoCircledIcon } from "@radix-ui/react-icons";

export function ChartPartialDataAlert() {
  const [state] = useEditorState();
  const { stream: rows } = useDatagridTableSpace()!;
  const { datagrid_query_estimated_count } = state;

  if (!rows || !datagrid_query_estimated_count) return <></>;
  if (rows.length < datagrid_query_estimated_count) {
    return (
      <Alert>
        <InfoCircledIcon className="h-4 w-4" />
        <AlertTitle>
          Good to know: This chart is based on {rows.length} rows of{" "}
          {datagrid_query_estimated_count}
        </AlertTitle>
        <AlertDescription>
          This chart is based on a partial data set. You can load more rows up
          to 1000. (max numbers of rows per page) After that, you may want to
          use filters to build more accurate chart
        </AlertDescription>
      </Alert>
    );
  }
}
