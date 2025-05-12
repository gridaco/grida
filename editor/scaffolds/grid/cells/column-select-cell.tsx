import React, { InputHTMLAttributes } from "react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { EnterFullScreenIcon } from "@radix-ui/react-icons";
import type { CheckedState } from "@radix-ui/react-checkbox";

type SharedInputProps = Pick<
  InputHTMLAttributes<HTMLInputElement>,
  "disabled" | "tabIndex" | "onClick" | "aria-label" | "aria-labelledby"
>;

interface SelectCellFormatterProps extends SharedInputProps {
  value: boolean;
  expandable?: boolean;
  onExpandClick?: () => void;
  onChange: (value: boolean, isShiftClick: boolean) => void;
}

export function SelectColumnCell({
  value,
  expandable,
  onExpandClick,
  tabIndex,
  disabled,
  onChange,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: SelectCellFormatterProps) {
  function handleChange(checked: CheckedState) {
    onChange(checked === true, false);
  }

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
        onClick={(event) => {
          event.stopPropagation();
        }}
        onDoubleClick={(event) => {
          event.stopPropagation();
        }}
      />
      {expandable && (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <button
              className="rdg-row__select-column__edit-action"
              onClick={onExpandClick}
              style={{
                padding: 3,
              }}
            >
              <EnterFullScreenIcon />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Expand row</TooltipContent>
        </Tooltip>
      )}
    </>
  );
}
