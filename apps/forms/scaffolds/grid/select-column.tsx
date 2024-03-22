"use client";

// Note: This code is originally from supabase/studio (Apache-2.0 License)

import {
  CalculatedColumn,
  RenderCellProps,
  RenderGroupCellProps,
  RenderHeaderCellProps,
  useRowSelection,
} from "react-data-grid";
import {
  ChangeEvent,
  InputHTMLAttributes,
  SyntheticEvent,
  useCallback,
} from "react";
import { GFRow } from "./types";
import * as Tooltip from "@radix-ui/react-tooltip";
import { EnterFullScreenIcon } from "@radix-ui/react-icons";
import { useEditorState } from "../editor";

function stopPropagation(event: SyntheticEvent) {
  event.stopPropagation();
}

export const SelectColumn: CalculatedColumn<any, any> = {
  key: "__gf_select",
  name: "",
  idx: 0,
  width: 65,
  maxWidth: 65,
  resizable: false,
  sortable: false,
  frozen: true,
  isLastFrozenColumn: false,
  renderHeaderCell: (props: RenderHeaderCellProps<unknown>) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [isRowSelected, onRowSelectionChange] = useRowSelection();

    return (
      <SelectCellHeader
        aria-label="Select All"
        tabIndex={props.tabIndex}
        value={isRowSelected}
        onChange={(checked) =>
          onRowSelectionChange({ type: "HEADER", checked })
        }
      />
    );
  },
  renderCell: (props: RenderCellProps<GFRow>) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [isRowSelected, onRowSelectionChange] = useRowSelection();
    return (
      <SelectCellFormatter
        aria-label="Select"
        tabIndex={props.tabIndex}
        value={isRowSelected}
        row={props.row}
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
    );
  },
  renderGroupCell: (props: RenderGroupCellProps<GFRow>) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [isRowSelected, onRowSelectionChange] = useRowSelection();
    return (
      <SelectCellFormatter
        aria-label="Select Group"
        tabIndex={props.tabIndex}
        value={isRowSelected}
        onChange={(checked) => {
          onRowSelectionChange({
            type: "ROW",
            row: props.row,
            checked,
            isShiftClick: false,
          });
        }}
        // Stop propagation to prevent row selection
        onClick={stopPropagation}
      />
    );
  },

  parent: undefined,
  level: 0,
  minWidth: 0,
  draggable: false,
};

type SharedInputProps = Pick<
  InputHTMLAttributes<HTMLInputElement>,
  "disabled" | "tabIndex" | "onClick" | "aria-label" | "aria-labelledby"
>;

interface SelectCellFormatterProps extends SharedInputProps {
  value: boolean;
  row?: GFRow;
  onChange: (value: boolean, isShiftClick: boolean) => void;
}

function SelectCellFormatter({
  row,
  value,
  tabIndex,
  disabled,
  onClick,
  onChange,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: SelectCellFormatterProps) {
  const id = row?.__gf_id;
  const [state, dispatch] = useEditorState();

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    onChange(e.target.checked, (e.nativeEvent as MouseEvent).shiftKey);
  }

  const onEnterFullScreenClick = useCallback(() => {
    dispatch({
      type: "editor/responses/edit",
      response_id: id,
    });
  }, [dispatch, id]);

  return (
    <div className="group sb-grid-select-cell__formatter">
      <input
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        tabIndex={tabIndex}
        type="checkbox"
        className="rdg-row__select-column__select-action"
        disabled={disabled}
        checked={value}
        onChange={handleChange}
        onClick={onClick}
      />
      {row && (
        <Tooltip.Root delayDuration={0}>
          <Tooltip.Trigger asChild>
            <button
              className="rdg-row__select-column__edit-action"
              onClick={onEnterFullScreenClick}
              style={{
                padding: 3,
              }}
            >
              <EnterFullScreenIcon />
            </button>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content side="bottom">
              <Tooltip.Arrow />
              <div
                className={
                  "rounded bg-white py-1 px-2 leading-none shadow border border-background"
                }
              >
                <span className="text-xs text-foreground">Expand row</span>
              </div>
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      )}
    </div>
  );
}

interface SelectCellHeaderProps extends SharedInputProps {
  value: boolean;
  onChange: (value: boolean, isShiftClick: boolean) => void;
}

function SelectCellHeader({
  disabled,
  tabIndex,
  value,
  onChange,
  onClick,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: SelectCellHeaderProps) {
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    onChange(e.target.checked, (e.nativeEvent as MouseEvent).shiftKey);
  }

  return (
    <div className="sb-grid-select-cell__header">
      <input
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        tabIndex={tabIndex}
        type="checkbox"
        className="sb-grid-select-cell__header__input"
        disabled={disabled}
        checked={value}
        onChange={handleChange}
        onClick={onClick}
      />
    </div>
  );
}
