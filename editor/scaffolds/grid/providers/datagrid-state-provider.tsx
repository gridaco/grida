import React, { useCallback, useMemo } from "react";
import { DataFormat } from "@/scaffolds/data-format";
import type { DataGridCellSelectionCursor } from "../types";
import type { DataGridCellRootProps } from "../cells";
import { MarkerConfig, mask } from "../grid-text-mask";
import assert from "assert";

type State = {
  masking_enabled?: boolean;
  local_cursor_id?: string;
  selections?: Array<DataGridCellSelectionCursor>;
  highlightTokens?: string[];
  dateformat: DataFormat.DateFormat;
  datetz: DataFormat.DateTZ;
};

const Context = React.createContext<State | null>(null);

export function StandaloneDataGridStateProvider({
  masking_enabled,
  local_cursor_id,
  selections,
  highlightTokens,
  children,
  dateformat = "datetime",
  datetz = DataFormat.SYM_LOCALTZ,
}: React.PropsWithChildren<{
  masking_enabled?: boolean;
  local_cursor_id?: string;
  selections?: Array<DataGridCellSelectionCursor>;
  highlightTokens?: string[];
  dateformat?: DataFormat.DateFormat;
  datetz?: DataFormat.DateTZ;
}>) {
  return (
    <Context.Provider
      value={{
        masking_enabled,
        local_cursor_id,
        selections,
        highlightTokens: highlightTokens,
        dateformat,
        datetz,
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useDataGridState() {
  const context = React.useContext(Context);
  if (!context) {
    throw new Error(
      "useDataGridState must be used within a StandaloneDataGridStateProvider"
    );
  }

  return context;
}

/**
 * @example
 * ```tsx
 * const mask = useMasking();
 * ```
 */
export function useMasking() {
  const { masking_enabled } = useDataGridState();

  return useCallback(
    (txt: string | undefined, config?: MarkerConfig): string | undefined => {
      return masking_enabled && typeof txt === "string"
        ? mask(txt, config)
        : txt?.toString();
    },
    [masking_enabled]
  );
}

/**
 * @example
 * ```tsx
 * const format = useDateFormatting();
 * ```
 */
export function useDateFormatting() {
  const { dateformat, datetz } = useDataGridState();

  return useCallback(
    (date: Date | string) => {
      return DataFormat.fmtdate(date, dateformat, datetz);
    },
    [dateformat, datetz]
  );
}

type CellSelection = {
  column: string;
  cursor_id: string;
  color: string;
  is_local_cursor: boolean;
};

function getCellSelection({
  local_cursor_id,
  selections,
  column,
  pk,
}: {
  local_cursor_id: string;
  selections: DataGridCellSelectionCursor[];
  pk: string | -1;
  column: string;
}): CellSelection | undefined {
  const thiscolumnselections = selections
    .filter((s) => s.column === column && s.pk === pk)
    .sort((a, b) => {
      if (a.cursor_id === local_cursor_id) return -1;
      if (b.cursor_id === local_cursor_id) return 1;
      return 0;
    });

  const first = thiscolumnselections[0];
  if (first) {
    return {
      column,
      cursor_id: first.cursor_id,
      color: first.color,
      is_local_cursor: first.cursor_id === local_cursor_id,
    };
  }
}

export function useCellSelection(pk: string | -1, column: string) {
  const { selections, local_cursor_id } = useDataGridState();

  return useMemo(() => {
    if (!local_cursor_id || !selections) return undefined;
    return getCellSelection({
      local_cursor_id,
      selections,
      pk,
      column,
    });
  }, [local_cursor_id, selections, pk, column]);
}

export function useCellRootProps(
  pk: string | -1,
  column: string
): DataGridCellRootProps {
  const selection = useCellSelection(pk, column);

  return {
    selected: selection !== undefined,
    is_local_cursor: selection?.is_local_cursor,
    color: selection?.color,
  };
}
