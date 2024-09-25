import React, { useMemo } from "react";
import type { DataGridCellSelectionCursor } from "../types";
import type { DataGridCellRootProps } from "../cells";

type State = {
  local_cursor_id: string;
  selections: Array<DataGridCellSelectionCursor>;
};

const Context = React.createContext<State | null>(null);

export function DataGridMultiplayerProvider({
  children,
  local_cursor_id,
  selections,
}: React.PropsWithChildren<{
  local_cursor_id: string;
  selections: Array<DataGridCellSelectionCursor>;
}>) {
  // const contextValue = useMemo(
  //   () => (),
  //   [local_cursor_id, selections]
  // );

  return (
    <Context.Provider
      value={{
        local_cursor_id,
        selections,
      }}
    >
      {children}
    </Context.Provider>
  );
}

function useDataGridMultiplayer() {
  const context = React.useContext(Context);
  if (!context) {
    throw new Error(
      "useGridMultiplayer must be used within a GridMultiplayerProvider"
    );
  }

  return context;
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
  const { selections, local_cursor_id } = useDataGridMultiplayer();

  return useMemo(
    () =>
      getCellSelection({
        local_cursor_id,
        selections,
        pk,
        column,
      }),
    [local_cursor_id, selections, pk, column]
  );
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
