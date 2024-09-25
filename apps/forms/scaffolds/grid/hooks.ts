import { useCallback } from "react";
import { useEditorState } from "../editor";
import { DataGridCellRootProps } from "./cells/cell";
import { useCellSelection } from "./multiplayer";
import { mask } from "./mask";

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

export function useMasking() {
  const [state] = useEditorState();
  return useCallback(
    (txt: string): string => {
      return state.datagrid_local_filter.masking_enabled &&
        typeof txt === "string"
        ? mask(txt)
        : txt.toString();
    },
    [state.datagrid_local_filter.masking_enabled]
  );
}
