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
import { GFResponseRow } from "./types";
import * as Tooltip from "@radix-ui/react-tooltip";
import { EnterFullScreenIcon } from "@radix-ui/react-icons";
import { useEditorState } from "../editor";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckedState } from "@radix-ui/react-checkbox";
import { CellRoot } from "./cells";
import { useCellRootProps } from "./hooks";

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
  renderHeaderCell: (props: RenderHeaderCellProps<unknown>) => {
    const { column } = props;
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [isRowSelected, onRowSelectionChange] = useRowSelection();
    const rootprops = useCellRootProps(-1, column.key);

    return (
      <CellRoot {...rootprops} className="border-t-0">
        <SelectCellHeader
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
  renderCell: (props: RenderCellProps<GFResponseRow>) => {
    const { column, row } = props;
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [isRowSelected, onRowSelectionChange] = useRowSelection();
    const rootprops = useCellRootProps(row.__gf_id, column.key);
    return (
      <CellRoot {...rootprops} className="group">
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
      </CellRoot>
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
  row?: GFResponseRow;
  onChange: (value: boolean, isShiftClick: boolean) => void;
}

function SelectCellFormatter({
  row,
  value,
  tabIndex,
  disabled,
  onChange,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: SelectCellFormatterProps) {
  const id = row?.__gf_id;
  const [state, dispatch] = useEditorState();

  function handleChange(checked: CheckedState) {
    onChange(checked === true, false);
  }

  const onEnterFullScreenClick = useCallback(() => {
    dispatch({
      type: "editor/panels/record-edit",
      response_id: id,
      refresh: true,
    });
  }, [dispatch, id]);

  return (
    <>
      <Checkbox
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        tabIndex={tabIndex}
        className="rdg-row__select-column__select-action"
        disabled={disabled}
        checked={value}
        onCheckedChange={handleChange}
        onClick={stopPropagation}
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
                  "bg-background rounded border py-1 px-2 leading-none shadow"
                }
              >
                <span className="text-xs text-foreground">Expand row</span>
              </div>
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      )}
    </>
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
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: SelectCellHeaderProps) {
  function handleChange(checked: CheckedState) {
    onChange(checked === true, false);
  }

  return (
    <Checkbox
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      tabIndex={tabIndex}
      className="rdg-row__select-column__select-action"
      disabled={disabled}
      checked={value}
      onCheckedChange={handleChange}
      onClick={stopPropagation}
    />
  );
}
