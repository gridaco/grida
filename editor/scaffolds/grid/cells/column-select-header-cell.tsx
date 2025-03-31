import React, { InputHTMLAttributes } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import type { CheckedState } from "@radix-ui/react-checkbox";

type SharedInputProps = Pick<
  InputHTMLAttributes<HTMLInputElement>,
  "disabled" | "tabIndex" | "onClick" | "aria-label" | "aria-labelledby"
>;

interface SelectCellHeaderProps extends SharedInputProps {
  value: boolean;
  onChange: (value: boolean, isShiftClick: boolean) => void;
}

export function SelectColumnHeaderCell({
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
      onClick={(event) => {
        event.stopPropagation();
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
      }}
    />
  );
}
