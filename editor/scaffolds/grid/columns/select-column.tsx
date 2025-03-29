"use client";

import React, { SyntheticEvent } from "react";
import {
  CalculatedColumn,
  RenderCellProps,
  RenderHeaderCellProps,
  useRowSelection,
} from "react-data-grid";
import { type DGResponseRow } from "../types";
import { CellRoot } from "../cells";
import { useCellRootProps } from "../providers";
import { SelectColumnHeaderCell } from "../cells/column-select-header-cell";
import { SelectColumnCell } from "../cells/column-select-cell";

type ExpandRowContextState<TRow> = {
  onExpandClick?: (row: TRow) => void;
};

const ExpandRowContext = React.createContext<ExpandRowContextState<any> | null>(
  {
    onExpandClick: () => {},
  }
);

export function ExpandRowProvider<TRow>({
  onExpandClick,
  children,
}: React.PropsWithChildren<ExpandRowContextState<TRow>>) {
  return (
    <ExpandRowContext.Provider value={{ onExpandClick }}>
      {children}
    </ExpandRowContext.Provider>
  );
}

function useExpandRow<TRow>() {
  const context = React.useContext(ExpandRowContext);
  return context as ExpandRowContextState<TRow>;
}

function stopPropagation(event: SyntheticEvent) {
  event.stopPropagation();
}

export const SelectColumn: CalculatedColumn<any, any> = {
  key: "__rdg__select",
  name: "",
  idx: 0,
  width: 65,
  maxWidth: 65,
  resizable: false,
  sortable: false,
  frozen: true,
  renderHeaderCell: (props: RenderHeaderCellProps<unknown>) => {
    const { column } = props;
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [isRowSelected, onRowSelectionChange] = useRowSelection();
    const rootprops = useCellRootProps(-1, column.key);

    return (
      <CellRoot {...rootprops} className="border-t-0">
        <SelectColumnHeaderCell
          aria-label="Select All"
          tabIndex={props.tabIndex}
          value={isRowSelected}
          onChange={(checked) =>
            onRowSelectionChange({ type: "HEADER", checked })
          }
        />
      </CellRoot>
    );
  },
  renderCell: (props: RenderCellProps<DGResponseRow>) => {
    const { column, row } = props;
    const { onExpandClick } = useExpandRow<DGResponseRow>();

    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [isRowSelected, onRowSelectionChange] = useRowSelection();
    const rootprops = useCellRootProps(row.__gf_id, column.key);
    return (
      <CellRoot {...rootprops} className="group">
        <SelectColumnCell
          aria-label="Select"
          tabIndex={props.tabIndex}
          value={isRowSelected}
          expandable={!!!row && !!!onExpandClick ? true : false}
          onExpandClick={() => {
            onExpandClick?.(row);
          }}
          onChange={(checked, isShiftClick) => {
            onRowSelectionChange({
              type: "ROW",
              row: props.row,
              checked,
              isShiftClick,
            });
          }}
          // Stop propagation to prevent row selection
          onClick={stopPropagation}
        />
      </CellRoot>
    );
  },
  parent: undefined,
  level: 0,
  minWidth: 0,
  draggable: false,
};
