"use client";
import { useCallback } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useDatagridTableSpace, useEditorState } from "../editor";
import { InfoCircledIcon } from "@radix-ui/react-icons";
import { Button } from "@/components/ui-editor/button";

export function useChartDataStat() {
  const [state] = useEditorState();
  const { stream: rows } = useDatagridTableSpace()!;
  const { datagrid_query_estimated_count } = state;

  if (!rows || !datagrid_query_estimated_count) {
    return;
  }

  const is_data_not_fully_loaded = rows.length < datagrid_query_estimated_count;

  return {
    is_data_not_fully_loaded,
    count: rows.length,
    estimated_count: datagrid_query_estimated_count,
  };
}

export function ChartPartialDataAlert({
  count,
  estimated_count,
}: {
  count: number;
  estimated_count: number;
}) {
  const [state, dispatch] = useEditorState();

  const onLoadMax = useCallback(() => {
    dispatch({
      type: "data/query/page-limit",
      limit: 1000,
    });
  }, [dispatch]);

  return (
    <Alert className="bg-background/80 backdrop-blur-sm max-w-md">
      <InfoCircledIcon className="size-4" />
      <AlertTitle>
        Filter Adjustment: Displaying {count} out of {estimated_count} rows
      </AlertTitle>
      <AlertDescription className="text-muted-foreground text-xs">
        This chart shows a subset of data. You can load up to 1000 rows per
        page. For better accuracy, apply filters to refine the chart.
        {(state.datagrid_query?.q_page_limit ?? 0) < 1000 && (
          <div className="pt-4">
            <Button variant="outline" size="xs" onClick={onLoadMax}>
              Load 1,000
            </Button>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
